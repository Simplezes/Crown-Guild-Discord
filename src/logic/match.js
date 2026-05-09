import { EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";
import { resolveMonsterName } from "../utils.js";

export default {
  async execute(interaction) {
    const userId = interaction.user.id;
    const monsterName = interaction.options.getString("monster");
    const role = interaction.options.getString("role") || "seeker";

    let targetMonster = null;
    if (monsterName) {
      targetMonster = await resolveMonsterName(monsterName);
      if (!targetMonster) {
        return interaction.reply({
          content: `Monster **${monsterName}** not found.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (role === "seeker") {
      return this.handleSeeker(interaction, userId, targetMonster);
    } else {
      return this.handleHost(interaction, userId, targetMonster);
    }
  },

  async handleSeeker(interaction, userId, targetMonster) {
    let wishlistItems = [];

    if (targetMonster) {
      wishlistItems = [{ monster_id: targetMonster.id, type: 'both', tempered: 0 }];
    } else {
      const wishlistRes = await db.execute({
        sql: "SELECT monster_id, type, tempered FROM wishlist WHERE user_id = ?",
        args: [userId],
      });
      wishlistItems = wishlistRes.rows;
    }

    if (wishlistItems.length === 0) {
      return interaction.reply({
        content: "Your wishlist is empty! Use `/wishlist add` first so I know what you are looking for.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const matches = [];
    for (const wish of wishlistItems) {
      const typeFilter = wish.type === 'both' ? "('small', 'large')" : `('${wish.type}')`;
      const hostRes = await db.execute({
        sql: `
          SELECT c.user_id, m.name as monster_name, m.emoji, c.type, c.tempered, c.strength_rating,
                 (SELECT 1 FROM wishlist w2 
                  WHERE w2.user_id = c.user_id 
                  AND w2.monster_id IN (SELECT monster_id FROM crowns WHERE user_id = ?)
                  LIMIT 1) as is_mutual
          FROM crowns c
          JOIN monsters m ON c.monster_id = m.id
          WHERE c.monster_id = ? AND c.type IN ${typeFilter} AND c.tempered >= ? AND c.user_id != ?
          ORDER BY is_mutual DESC, c.tempered DESC, c.strength_rating DESC
          LIMIT 3
        `,
        args: [userId, wish.monster_id, wish.tempered, userId],
      });
      matches.push(...hostRes.rows);
    }

    if (matches.length === 0) {
      return interaction.reply({
        content: "No hosts found for your requested monster(s) yet. Try expanding your wishlist!",
        flags: MessageFlags.Ephemeral,
      });
    }

    return this.renderMatches(interaction, matches, "Found Hosts for your Wishlist");
  },

  async handleHost(interaction, userId, targetMonster) {
    let myCrowns = [];

    if (targetMonster) {
      const crownRes = await db.execute({
        sql: "SELECT monster_id, type, tempered FROM crowns WHERE user_id = ? AND monster_id = ?",
        args: [userId, targetMonster.id],
      });
      myCrowns = crownRes.rows;
    } else {
      const crownRes = await db.execute({
        sql: "SELECT monster_id, type, tempered FROM crowns WHERE user_id = ?",
        args: [userId],
      });
      myCrowns = crownRes.rows;
    }

    if (myCrowns.length === 0) {
      return interaction.reply({
        content: "You don't have any crowns registered! You can only 'Host' matches for monsters you have crowns for.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const matches = [];
    for (const crown of myCrowns) {
      const seekerRes = await db.execute({
        sql: `
          SELECT w.user_id, m.name as monster_name, m.emoji, w.type, w.tempered, 0 as strength_rating,
                 (SELECT 1 FROM crowns c2 
                  WHERE c2.user_id = w.user_id 
                  AND c2.monster_id IN (SELECT monster_id FROM wishlist WHERE user_id = ?)
                  LIMIT 1) as is_mutual
          FROM wishlist w
          JOIN monsters m ON w.monster_id = m.id
          WHERE w.monster_id = ? AND (w.type = 'both' OR w.type = ?) AND w.tempered <= ? AND w.user_id != ?
          ORDER BY is_mutual DESC
          LIMIT 3
        `,
        args: [userId, crown.monster_id, crown.type, crown.tempered, userId],
      });
      matches.push(...seekerRes.rows);
    }

    if (matches.length === 0) {
      return interaction.reply({
        content: "No hunters are currently seeking the crowns you have. Check back later!",
        flags: MessageFlags.Ephemeral,
      });
    }

    return this.renderMatches(interaction, matches, "Hunters Seeking your Crowns");
  },

  renderMatches(interaction, matches, title) {
    const matchLines = matches.slice(0, 10).map((m) => {
      const mutualLabel = m.is_mutual ? ` ${E.linkParty} **Mutual!**` : "";
      const typeEmoji = m.type === 'small' ? E.smallCrown : E.largeCrown;
      const tempLabel = m.tempered ? `${E.tempered} ` : "";
      const rating = m.strength_rating > 0 ? ` (${m.strength_rating}★)` : "";
      return `> ${m.emoji} **${m.monster_name}** (${tempLabel}${typeEmoji}${rating})${mutualLabel}\n> Hunter: <@${m.user_id}>`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`${E.communication} ${title}`)
      .setDescription([
        "Matches found within the Crown Guild database:",
        "",
        ...matchLines,
      ].join("\n"))
      .setColor(0xF1C40F)
      .setFooter({ text: "Contact these hunters to coordinate your hunt!" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
