import { EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";
import { formatMonsterName } from "../utils.js";

export default {
  async execute(interaction) {
    await db.execute({
      sql: "DELETE FROM active_flares WHERE created_at < datetime('now', '-10 minutes')"
    });

    const res = await db.execute({
      sql: `
        SELECT f.*, u.username, m.name as monster_name, m.emoji, m.image_name
        FROM active_flares f
        JOIN users u ON f.host_id = u.id
        JOIN monsters m ON f.monster_id = m.id
        ORDER BY f.created_at DESC
      `
    });

    if (res.rows.length === 0) {
      return interaction.reply({
        content: "No active SOS flares found. Be the first to fire one with `/hunt flare`!",
        flags: MessageFlags.Ephemeral
      });
    }

    const flareLines = res.rows.map(row => {
      const displayName = formatMonsterName(row.monster_name, row.tempered);
      
      const typeLabel = row.type === 'small' ? "Small" : "Large";
      const typeEmoji = row.type === 'small' ? E.smallCrown : E.largeCrown;
      
      const timeAgo = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 60000);
      const timeText = timeAgo === 0 ? "just now" : `${timeAgo}m ago`;

      return `**${row.emoji} ${displayName}** (${typeEmoji} ${typeLabel})\n> Host: <@${row.host_id}> • Session: \`${row.session_id}\` • *${timeText}*`;
    });

    const embed = new EmbedBuilder()
      .setTitle("📡 Active SOS Radar")
      .setDescription(flareLines.join("\n\n"))
      .setColor(0x3498DB)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
