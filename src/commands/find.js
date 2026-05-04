import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import db from "../database.js";
import { handleCrownedMonsterAutocomplete, resolveMonsterName } from "../utils.js";
import { buildPage } from "../pagination.js";
import { E } from "../emojis.js";
import path from "path";
import fs from "fs";

export default {
  data: new SlashCommandBuilder()
    .setName("find")
    .setDescription("Find players who have a specific monster's crowns")
    .addStringOption((option) =>
      option
        .setName("monster")
        .setDescription("The name of the monster (optional, shows all if omitted)")
        .setRequired(false)
        .setAutocomplete(true)
    ),
  async autocomplete(interaction) {
    await handleCrownedMonsterAutocomplete(interaction);
  },
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const monsterName = interaction.options.getString("monster")?.toLowerCase().trim();

    let resolvedName = monsterName;
    if (monsterName) {
      const monster = await resolveMonsterName(monsterName);
      if (monster) resolvedName = monster.name;
    }

    let sql = `
      SELECT c.user_id, m.id as monster_id, m.name, c.type, c.tempered, m.image_name, m.emoji, c.remaining_uses, c.quest, c.strength_rating
      FROM crowns c
      JOIN monsters m ON c.monster_id = m.id
    `;
    let args = [];
    if (resolvedName) {
      sql += " WHERE LOWER(m.name) = LOWER(?)";
      args.push(resolvedName);
    }
    sql += " ORDER BY m.name ASC, c.tempered DESC, c.type ASC";

    const res = await db.execute({ sql, args });

    if (res.rows.length === 0) {
      return interaction.editReply({
        content: monsterName
          ? `No one has crowns for **${monsterName}** yet.`
          : "No crowns have been registered yet.",
      });
    }

    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    const grouped = {};
    res.rows.forEach((row) => {
      const key = row.name;
      if (!grouped[key]) {
        grouped[key] = {
          monster_id: row.monster_id,
          emoji: row.emoji || "🐉",
          image: row.image_name,
          normal: { small: [], large: [] },
          tempered: { small: [], large: [] },
        };
      }
      const bucket = row.tempered ? grouped[key].tempered : grouped[key].normal;
      bucket[row.type].push({ id: row.user_id, uses: row.remaining_uses, quest: row.quest, strength: row.strength_rating });
    });

    if (resolvedName) {
      const data = Object.values(grouped)[0];
      if (!data) {
        return interaction.editReply({
          content: `No one has crowns for **${resolvedName}** yet.`,
        });
      }
      const displayName = resolvedName.split(" ").map(capitalize).join(" ");

      const statsRes = await db.execute({
        sql: "SELECT COUNT(*) as total FROM completed_missions WHERE monster_id = ?",
        args: [data.monster_id],
      });
      const missionsCompleted = statsRes.rows[0]?.total || 0;

      const totalHunters = new Set([
        ...data.normal.small.map(h => h.id), ...data.normal.large.map(h => h.id),
        ...data.tempered.small.map(h => h.id), ...data.tempered.large.map(h => h.id),
      ]).size;

      const formatList = (hunters) =>
        hunters.length > 0
          ? hunters.map((h) => {
            const usesText = (h.quest === "Investigation Quests" && h.uses !== null) ? ` (${h.uses} left)` : "";
            return `> <@${h.id}>${usesText} - ${h.strength}★`;
          }).join("\n")
          : "> *None yet*";

      const hasNormal = data.normal.small.length > 0 || data.normal.large.length > 0;
      const hasTempered = data.tempered.small.length > 0 || data.tempered.large.length > 0;

      const embed = new EmbedBuilder()
        .setAuthor({ name: "Crown Guild  •  Monster Search" })
        .setTitle(`${data.emoji}  ${displayName}`)
        .setColor(0xC4982A)
        .setDescription([
          `> ${E.questMembers} **${totalHunters}** hunter${totalHunters !== 1 ? "s" : ""} hold crowns for this monster`,
          `> ${E.notesCheckmark} **${missionsCompleted}** guild mission${missionsCompleted !== 1 ? "s" : ""} completed`,
        ].join("\n"))
        .setTimestamp();

      if (hasNormal) {
        embed.addFields(
          { name: `${E.smallCrown}  Small Crown`, value: formatList(data.normal.small), inline: true },
          { name: `${E.largeCrown}  Large Crown`, value: formatList(data.normal.large), inline: true },
          { name: "\u200b", value: "\u200b", inline: true }
        );
      }

      if (hasTempered) {
        embed.addFields(
          { name: `${E.tempered}  Tempered Small`, value: formatList(data.tempered.small), inline: true },
          { name: `${E.tempered}  Tempered Large`, value: formatList(data.tempered.large), inline: true },
          { name: "\u200b", value: "\u200b", inline: true }
        );
      }

      embed.setFooter({ text: "Click the button below to view active hosts and request a hunt!" });

      const files = [];
      if (data.image) {
        const iconPath = path.join(process.cwd(), "src/database/monsters", data.image);
        if (fs.existsSync(iconPath)) {
          embed.setThumbnail(`attachment://${data.image}`);
          files.push({ attachment: iconPath, name: data.image });
        }
      }

      const monsterUrlName = resolvedName.replace(/\s+/g, '%20').toLowerCase();

      const reqRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Open Guild Ledger")
          .setURL(`https://crownguild.vercel.app/monster/${monsterUrlName}`)
          .setStyle(ButtonStyle.Link)
      );

      return interaction.editReply({ embeds: [embed], files, components: [reqRow] });
    }

    const entries = Object.entries(grouped).map(([name, data]) => {
      const displayName = name.split(" ").map(capitalize).join(" ");
      const hasTempered = data.tempered.small.length > 0 || data.tempered.large.length > 0;

      const smallCount = data.normal.small.length;
      const largeCount = data.normal.large.length;
      const tSmallCount = data.tempered.small.length;
      const tLargeCount = data.tempered.large.length;

      const lines = [`**${data.emoji}  ${displayName}**`];
      if (smallCount > 0 || largeCount > 0) {
        lines.push(
          `> ${E.smallCrown} **${smallCount}** hunter${smallCount !== 1 ? "s" : ""}  ${E.largeCrown} **${largeCount}** hunter${largeCount !== 1 ? "s" : ""}`
        );
      }
      if (hasTempered) {
        lines.push(
          `> ${E.tempered} Tempered - Small **${tSmallCount}**  Large **${tLargeCount}**`
        );
      }
      return lines.join("\n");
    });

    const iconPath = path.join(process.cwd(), "icon.png");
    const files = fs.existsSync(iconPath) ? [{ attachment: iconPath, name: "icon.png" }] : [];

    const { embeds, components } = buildPage(
      null,
      entries,
      0,
      {
        color: 0xC4982A,
        authorName: "Crown Guild  •  Crown Registry",
        authorIconUrl: "attachment://icon.png",
        thumbnailUrl: "attachment://icon.png",
        footerSuffix: "Use /find monster: to see holders & request a crown",
        stateKey: "find_all",
        files,
      }
    );

    await interaction.editReply({ embeds, components, files });
  },
};
