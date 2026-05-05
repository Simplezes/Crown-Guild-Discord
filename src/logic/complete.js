import { EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";

export default {
  async execute(interaction) {
    const userId = interaction.user.id;

    const missionRes = await db.execute({
      sql: `SELECT m.*, mon.name as monster_name, mon.emoji, h.username as host_name 
            FROM active_missions m 
            JOIN monsters mon ON m.monster_id = mon.id 
            JOIN users h ON m.host_id = h.id
            WHERE m.requester_id = ?`,
      args: [userId]
    });

    if (missionRes.rows.length === 0) {
      return interaction.reply({ content: "You do not have an active mission!", flags: MessageFlags.Ephemeral });
    }

    const mission = missionRes.rows[0];

    await db.execute({
      sql: "INSERT INTO completed_missions (host_id, requester_id, monster_id, type, tempered, strength_rating) VALUES (?, ?, ?, ?, ?, ?)",
      args: [mission.host_id, mission.requester_id, mission.monster_id, mission.type, mission.tempered, mission.strength_rating]
    });

    await db.execute({
      sql: "DELETE FROM active_missions WHERE id = ?",
      args: [mission.id]
    });

    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    let displayName = mission.monster_name.split(' ').map(capitalize).join(' ');
    if (mission.tempered) displayName = `Tempered ${displayName}`;
    const typeLabel = mission.type === 'small' ? "Small Crown" : "Large Crown";
    const typeEmoji = mission.type === 'small' ? E.smallCrown : E.largeCrown;

    const embed = new EmbedBuilder()
      .setTitle(`${E.notesCheckmark} Mission Completed!`)
      .setDescription([
        `Successfully completed the hunt for ${mission.emoji || "🐉"} **${displayName}**!`,
        `> **Host:** <@${mission.host_id}>`,
        `> **Target:** ${typeEmoji} ${typeLabel}`,
        "",
        `Congratulations on the new crown, Hunter!`,
      ].join("\n"))
      .setColor(0x2ECC71)
      .setTimestamp();

    if (interaction.client.pusher) {
      interaction.client.pusher.trigger("public-channel", "mission_update", {});
      interaction.client.pusher.trigger("public-channel", "crown_update", {});
    }

    await interaction.reply({ embeds: [embed] });
  },
};
