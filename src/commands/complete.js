import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";

export default {
  data: new SlashCommandBuilder()
    .setName("complete")
    .setDescription("Mark your current active quest as completed"),
  async execute(interaction) {
    const userId = interaction.user.id;

    await db.execute({
      sql: "DELETE FROM active_missions WHERE created_at < datetime('now', '-50 minutes')"
    });

    const anyMissionRes = await db.execute({
      sql: `
        SELECT a.id, a.requester_id
        FROM active_missions a
        WHERE a.host_id = ? OR a.requester_id = ?
      `,
      args: [userId, userId],
    });

    const { MessageFlags } = await import("discord.js");

    if (anyMissionRes.rows.length === 0) {
      return interaction.reply({
        content: "You are not currently in an active mission.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const asHost = anyMissionRes.rows.find(r => r.requester_id !== userId);
    if (asHost && anyMissionRes.rows.every(r => r.requester_id !== userId)) {
      return interaction.reply({
        content: "Only the requester can mark a mission as complete. Your job as the host is done - just wait for them to run `/complete`!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const res = await db.execute({
      sql: `
        SELECT a.id, a.host_id, a.requester_id, a.type, a.tempered, a.strength_rating, m.id as monster_id, m.name, m.emoji
        FROM active_missions a
        JOIN monsters m ON a.monster_id = m.id
        WHERE a.requester_id = ?
      `,
      args: [userId],
    });
    const mission = res.rows[0];
    const hostId = mission.host_id;
    const requesterId = mission.requester_id;

    await db.execute({ sql: "INSERT OR IGNORE INTO users(id) VALUES (?)", args: [hostId] });
    await db.execute({ sql: "INSERT OR IGNORE INTO users(id) VALUES (?)", args: [requesterId] });
    await db.execute({
      sql: "UPDATE users SET shared_crowns = shared_crowns + 1 WHERE id = ?",
      args: [hostId],
    });

    await db.execute({
      sql: "UPDATE users SET missions_completed = missions_completed + 1 WHERE id = ?",
      args: [requesterId],
    });

    await db.execute({
      sql: "INSERT INTO completed_missions (host_id, requester_id, monster_id, type, tempered, strength_rating) VALUES (?, ?, ?, ?, ?, ?)",
      args: [hostId, requesterId, Number(mission.monster_id), mission.type, Number(mission.tempered), Number(mission.strength_rating)],
    });
    await db.execute({
      sql: "DELETE FROM active_missions WHERE id = ?",
      args: [Number(mission.id)],
    });

    const hostCrownRes = await db.execute({
      sql: `SELECT c.id, c.quest, c.remaining_uses, c.investigation_id,
                   inv.remaining_uses as inv_remaining_uses
            FROM crowns c
            LEFT JOIN investigations inv ON c.investigation_id = inv.id
            WHERE c.user_id = ? AND c.monster_id = ? AND c.type = ? AND c.tempered = ? AND c.strength_rating = ?
            ORDER BY COALESCE(inv.remaining_uses, c.remaining_uses) ASC LIMIT 1`,
      args: [hostId, mission.monster_id, mission.type, mission.tempered, mission.strength_rating]
    });
    const hostCrown = hostCrownRes.rows[0];

    if (hostCrown && hostCrown.quest === "Investigation Quests") {
      if (hostCrown.investigation_id) {
        const newUses = (hostCrown.inv_remaining_uses ?? 1) - 1;
        if (newUses <= 0) {
          const linkedRes = await db.execute({
            sql: "SELECT id FROM crowns WHERE investigation_id = ?",
            args: [Number(hostCrown.investigation_id)],
          });
          for (const lc of linkedRes.rows) {
            await db.execute({
              sql: "UPDATE web_notifications SET crown_id = NULL WHERE crown_id = ?",
              args: [Number(lc.id)],
            });
          }
          await db.execute({
            sql: "DELETE FROM crowns WHERE investigation_id = ?",
            args: [Number(hostCrown.investigation_id)],
          });
          await db.execute({
            sql: "DELETE FROM investigations WHERE id = ?",
            args: [Number(hostCrown.investigation_id)],
          });
        } else {
          await db.execute({
            sql: "UPDATE investigations SET remaining_uses = ? WHERE id = ?",
            args: [newUses, Number(hostCrown.investigation_id)],
          });
        }
      } else if (hostCrown.remaining_uses !== null) {
        const newUses = hostCrown.remaining_uses - 1;
        if (newUses <= 0) {
          await db.execute({
            sql: "UPDATE web_notifications SET crown_id = NULL WHERE crown_id = ?",
            args: [Number(hostCrown.id)],
          });
          await db.execute({
            sql: "DELETE FROM crowns WHERE id = ?",
            args: [Number(hostCrown.id)],
          });
        } else {
          await db.execute({
            sql: "UPDATE crowns SET remaining_uses = ? WHERE id = ?",
            args: [newUses, Number(hostCrown.id)],
          });
        }
      }
    }

    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    let displayParts = mission.name.split(' ').map(capitalize).join(' ');
    if (mission.tempered) {
      displayParts = `Tempered ${displayParts}`;
    }
    displayParts = `${displayParts} - ${mission.strength_rating}★`;

    const crownType = mission.type === 'small' ? "Small Crown" : "Large Crown";
    const typeEmoji = mission.type === 'small' ? E.smallCrown : E.largeCrown;

    const embed = new EmbedBuilder()
      .setTitle(`${E.notesCheckmark} Mission Completed!`)
      .setDescription(`The mission for ${mission.emoji} **${displayParts}** (${typeEmoji} ${crownType}) was a success!`)
      .addFields(
        { name: `${E.questMembers} Host`, value: `<@${hostId}>\n*Gained +1 Shared Crown!*`, inline: true },
        { name: `${E.completedObj} Requester`, value: `<@${requesterId}>\n*Gained +1 Mission Completed!*`, inline: true }
      )
      .setColor(0x2ECC71)
      .setTimestamp();

    if (interaction.client.pusher) {
      interaction.client.pusher.trigger("public-channel", "mission_update", { status: 'completed' });
      interaction.client.pusher.trigger("public-channel", "crown_update", {});
    }

    await interaction.reply({ embeds: [embed] });
  },
};
