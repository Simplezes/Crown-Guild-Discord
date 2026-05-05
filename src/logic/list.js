import { EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";
import path from "path";
import fs from "fs";
import { buildPage } from "../pagination.js";

export default {
  async execute(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const userId = targetUser.id;

    const res = await db.execute({
      sql: `
        SELECT m.name, m.emoji, c.type, c.tempered, c.quest
        FROM crowns c
        JOIN monsters m ON c.monster_id = m.id
        WHERE c.user_id = ?
        ORDER BY m.name ASC, c.tempered DESC, c.type ASC
      `,
      args: [userId],
    });

    if (res.rows.length === 0) {
      const msg = targetUser.id === interaction.user.id 
        ? "Your collection is empty! Log your first crown with `/crown add`." 
        : "This hunter's collection is empty!";
      return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }

    const collection = {};
    res.rows.forEach((row) => {
      let keyName = row.name;
      if (row.tempered) keyName = `Tempered ${row.name}`;
      if (!collection[keyName]) collection[keyName] = { emojis: [], monsterEmoji: row.emoji || "🐉" };
      const crownEmoji = row.type === "small" ? E.smallCrown : E.largeCrown;
      const typeLabel = row.type === "small" ? "Small" : "Large";
      const questLabel = row.quest ? ` (${row.quest})` : "";
      collection[keyName].emojis.push(`${crownEmoji} \`${typeLabel}\`${questLabel}`);
    });

    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const entries = Object.entries(collection).map(([name, data]) => {
      const displayName = name.split(" ").map(capitalize).join(" ");
      return `**${data.monsterEmoji} ${displayName}**\n> ${data.emojis.join("  •  ")}`;
    });

    const iconPath = path.join(process.cwd(), "icon.png");
    const files = fs.existsSync(iconPath) ? [{ attachment: iconPath, name: "icon.png" }] : [];

    const opts = {
      color: 0xC4982A,
      authorName: `${targetUser.username}  •  Crown Collection`,
      authorIconUrl: targetUser.displayAvatarURL(),
      thumbnailUrl: "attachment://icon.png",
      footerSuffix: `${Object.keys(collection).length} monsters tracked`,
      footerIconUrl: targetUser.displayAvatarURL(),
      stateKey: `list_${userId}`,
      files,
    };

    const { embeds, components } = buildPage(null, entries, 0, opts);
    await interaction.reply({ embeds, components, files: opts.files, flags: MessageFlags.Ephemeral });
  },
};
