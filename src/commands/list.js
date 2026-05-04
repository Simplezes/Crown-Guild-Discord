import { SlashCommandBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { buildPage, PAGE_SIZE } from "../pagination.js";
import { E } from "../emojis.js";
import path from "path";
import fs from "fs";

export default {
  data: new SlashCommandBuilder()
    .setName("list")
    .setDescription("View your personal crown collection"),
  async execute(interaction) {
    const userId = interaction.user.id;
    const user = interaction.user;

    const res = await db.execute({
      sql: `
        SELECT m.name, m.emoji, c.type, c.tempered, c.quest, c.remaining_uses, c.strength_rating
        FROM crowns c
        JOIN monsters m ON c.monster_id = m.id
        WHERE c.user_id = ?
        ORDER BY m.name ASC, c.tempered DESC, c.strength_rating DESC, c.type ASC
      `,
      args: [userId],
    });

    if (res.rows.length === 0) {
      return interaction.reply({
        content: "Your collection is empty! Use `/add` to start tracking your crowns.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const collection = {};
    res.rows.forEach((row) => {
      let keyName = row.name;
      if (row.tempered) keyName = `Tempered ${row.name}`;

      if (!collection[keyName]) {
        collection[keyName] = { crowns: [], monsterEmoji: row.emoji || "🐉" };
      }

      const crownEmoji = row.type === "small" ? E.smallCrown : E.largeCrown;
      const crownLabel = row.type === "small" ? "Small" : "Large";
      const usesLabel = (row.quest === "Investigation Quests" && row.remaining_uses !== null) ? ` (${row.remaining_uses} left)` : "";
      const questLabel = row.quest ? `*${row.quest}${usesLabel}*` : "";

      collection[keyName].crowns.push(`> ${crownEmoji} ${crownLabel} - ${row.strength_rating}★ ${questLabel ? "  -  " + questLabel : ""}`);
    });

    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    const entries = Object.entries(collection).map(([name, data]) => {
      const displayName = name.split(" ").map(capitalize).join(" ");
      return [
        `**${data.monsterEmoji} ${displayName}**`,
        ...data.crowns,
      ].join("\n");
    });

    const iconPath = path.join(process.cwd(), "icon.png");
    const files = fs.existsSync(iconPath) ? [{ attachment: iconPath, name: "icon.png" }] : [];

    const { embeds, components } = buildPage(
      null,
      entries,
      0,
      {
        color: 0xC4982A,
        authorName: `${user.username}  •  Crown Collection`,
        authorIconUrl: user.displayAvatarURL(),
        thumbnailUrl: "attachment://icon.png",
        footerSuffix: `${Object.keys(collection).length} monsters tracked`,
        footerIconUrl: user.displayAvatarURL(),
        stateKey: `list_${userId}`,
        files,
      }
    );

    await interaction.reply({ embeds, components, files, flags: MessageFlags.Ephemeral });
  },
};
