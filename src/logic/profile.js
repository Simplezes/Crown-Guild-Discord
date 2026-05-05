import { EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";

export default {
  async execute(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const userId = targetUser.id;

    const userRes = await db.execute({
      sql: "SELECT * FROM users WHERE id = ?",
      args: [userId],
    });

    if (userRes.rows.length === 0) {
      return interaction.reply({ content: "Hunter not found in the registry.", flags: MessageFlags.Ephemeral });
    }

    const user = userRes.rows[0];

    const statsRes = await db.execute({
      sql: `SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN type = 'small' THEN 1 ELSE 0 END) as small,
              SUM(CASE WHEN type = 'large' THEN 1 ELSE 0 END) as large,
              SUM(CASE WHEN tempered = 1 THEN 1 ELSE 0 END) as tempered
            FROM crowns WHERE user_id = ?`,
      args: [userId],
    });
    const stats = statsRes.rows[0];

    const activityRes = await db.execute({
      sql: `SELECT 
              (SELECT COUNT(*) FROM completed_missions WHERE host_id = ?) as hosted,
              (SELECT COUNT(*) FROM completed_missions WHERE requester_id = ?) as joined`,
      args: [userId, userId],
    });
    const activity = activityRes.rows[0];

    const topAssistRes = await db.execute({
      sql: `SELECT m.name, m.emoji, COUNT(*) as count
            FROM completed_missions cm
            JOIN monsters m ON cm.monster_id = m.id
            WHERE cm.host_id = ?
            GROUP BY cm.monster_id
            ORDER BY count DESC
            LIMIT 1`,
      args: [userId],
    });
    const topAssist = topAssistRes.rows[0];

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${targetUser.username}'s Hunter Card`, iconURL: targetUser.displayAvatarURL() })
      .setTitle(`${E.expeditionBoard} Guild Registry Profile`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(0xC4982A)
      .addFields(
        { name: "👑 Crown Collection", value: `Total: **${stats.total}**\nSmall: ${stats.small} • Large: ${stats.large} • Tempered: ${stats.tempered}`, inline: true },
        { name: "⚔️ Guild Activity", value: `Hosted: ${activity.hosted}\nJoined: ${activity.joined}`, inline: true },
        { name: "📍 Lobby Info", value: user.lobby_id ? `ID: \`${user.lobby_id}\`\nPass: \`${user.quest_password || "None"}\`` : "*No lobby info set*", inline: false }
      )
      .setTimestamp();

    if (user.status_message) {
      embed.setDescription(`*"${user.status_message}"*`);
    }

    if (topAssist) {
      embed.addFields({ name: "⭐ Top Assist", value: `${topAssist.emoji} **${topAssist.name}** (Shared ${topAssist.count} times)`, inline: false });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
