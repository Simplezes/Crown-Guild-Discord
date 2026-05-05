import { EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { handleMonsterAutocomplete, resolveMonsterName, capitalize, formatMonsterName } from "../utils.js";
import { buildPage } from "../pagination.js";
import { E } from "../emojis.js";

const WEB_BASE_URL = process.env.WEB_HUB_URL;

export default {
  async autocomplete(interaction) {
    await handleMonsterAutocomplete(interaction);
  },
  async execute(interaction) {
    const monsterName = interaction.options.getString("monster")?.toLowerCase().trim();

    if (!monsterName) {
      const res = await db.execute({
        sql: `
          SELECT c.user_id, m.id as monster_id, m.name, c.type, c.tempered, m.image_name, m.emoji
          FROM crowns c JOIN monsters m ON c.monster_id = m.id
          ORDER BY m.name ASC, c.tempered DESC, c.type ASC
        `,
        args: [],
      });

      const grouped = {};
      res.rows.forEach((row) => {
        let keyName = row.name;
        if (row.tempered) keyName = `Tempered ${row.name}`;
        if (!grouped[keyName]) grouped[keyName] = { small: [], large: [], emoji: row.emoji || "🐉" };
        grouped[keyName][row.type].push(`<@${row.user_id}>`);
      });

      const entries = Object.entries(grouped).map(([name, data]) => {
        const displayParts = name.split(" ").map(capitalize).join(" ");
        const smallLine = data.small.length > 0
          ? `> <:smallcrown:1500245360323465386> **${data.small.length}** hunter${data.small.length !== 1 ? "s" : ""}`
          : `> <:smallcrown:1500245360323465386> *None*`;
        const largeLine = data.large.length > 0
          ? `> <:largecrown:1500245422210420829> **${data.large.length}** hunter${data.large.length !== 1 ? "s" : ""}`
          : `> <:largecrown:1500245422210420829> *None*`;
        return `**${data.emoji}  ${displayParts}**\n${smallLine}\n${largeLine}`;
      });

      const iconUrl = `${WEB_BASE_URL}/icon.png`;

      const opts = {
        color: 0xC4982A,
        authorName: "Crown Guild  •  Crown Registry",
        authorIconUrl: iconUrl,
        thumbnailUrl: iconUrl,
        footerSuffix: "Use /hunt find monster: to see holders & request a crown",
        stateKey: "find_all",
      };

      const { embeds, components } = buildPage(null, entries, 0, opts);
      return interaction.reply({ embeds, components, flags: MessageFlags.Ephemeral });
    }

    const monster = await resolveMonsterName(monsterName);
    if (!monster) {
      return interaction.reply({ content: `Monster **${monsterName}** not found.`, flags: MessageFlags.Ephemeral });
    }

    const res = await db.execute({
      sql: `
        SELECT c.id, c.user_id, c.type, c.tempered, c.strength_rating, c.quest, c.remaining_uses
        FROM crowns c
        WHERE c.monster_id = ?
        ORDER BY c.tempered DESC, c.remaining_uses DESC, c.strength_rating DESC
      `,
      args: [monster.id],
    });

    const smallHolders = res.rows.filter(r => r.type === "small");
    const largeHolders = res.rows.filter(r => r.type === "large");

    const mName = formatMonsterName(monster.name, false);

    const formatHolders = (holders) => {
      if (holders.length === 0) return "*None Recorded*";
      return holders.map(h => {
        const t = h.tempered ? `${E.tempered} ` : "";
        const u = h.quest === "Investigation Quests" && h.remaining_uses !== null ? ` (${h.remaining_uses} uses)` : "";
        return `> <@${h.user_id}> - ${t}${h.strength_rating}★${u}`;
      }).join("\n");
    };

    const embed = new EmbedBuilder()
      .setTitle(`${monster.emoji || "🐉"} ${mName} Holders`)
      .addFields(
        { name: `${E.smallCrown} Small Crown`, value: formatHolders(smallHolders), inline: true },
        { name: `${E.largeCrown} Large Crown`, value: formatHolders(largeHolders), inline: true }
      )
      .setColor(0xC4982A)
      .setTimestamp();

    if (monster.image_name) {
      embed.setThumbnail(`${WEB_BASE_URL}/monsters/${monster.image_name}`);
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
