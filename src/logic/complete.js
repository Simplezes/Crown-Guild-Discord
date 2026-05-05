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

    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    let displayName = mission.monster_name.split(' ').map(capitalize).join(' ');
    if (mission.tempered) displayName = `Tempered ${displayName}`;
    const typeLabel = mission.type === 'small' ? "Small Crown" : "Large Crown";
    const typeEmoji = mission.type === 'small' ? E.smallCrown : E.largeCrown;

    // --- Group mission (SOS flare) ---
    if (mission.group_id) {
      await db.execute({
        sql: "UPDATE active_missions SET hunter_confirmed = 1 WHERE id = ?",
        args: [mission.id]
      });

      const groupRes = await db.execute({
        sql: "SELECT * FROM active_missions WHERE group_id = ?",
        args: [mission.group_id]
      });

      const allConfirmed = groupRes.rows.every(m => m.hunter_confirmed === 1);

      if (interaction.client.pusher) {
        interaction.client.pusher.trigger("public-channel", "mission_update", { type: 'group_confirmed' }).catch(() => {});
      }

      if (!allConfirmed) {
        const confirmedCount = groupRes.rows.filter(m => m.hunter_confirmed === 1).length;
        const total = groupRes.rows.length;
        return interaction.reply({
          content: `${E.notesCheckmark} Crown logged! Waiting for the rest of the party... (**${confirmedCount}/${total}** confirmed)`,
          flags: MessageFlags.Ephemeral
        });
      }

      // All confirmed — complete all group missions
      for (const m of groupRes.rows) {
        await db.execute({
          sql: "UPDATE users SET shared_crowns = shared_crowns + 1 WHERE id = ?",
          args: [m.host_id]
        });
        await db.execute({
          sql: "UPDATE users SET missions_completed = missions_completed + 1 WHERE id = ?",
          args: [m.requester_id]
        });
        await db.execute({
          sql: "INSERT INTO completed_missions (host_id, requester_id, monster_id, type, tempered, strength_rating) VALUES (?, ?, ?, ?, ?, ?)",
          args: [m.host_id, m.requester_id, m.monster_id, m.type, m.tempered, m.strength_rating]
        });
      }

      // Deduct investigation once for the host
      const fm = groupRes.rows[0];
      const invRes = await db.execute({
        sql: `SELECT c.id, c.investigation_id,
                     COALESCE(inv.remaining_uses, c.remaining_uses) as remaining_uses,
                     inv.id as inv_id
              FROM crowns c
              LEFT JOIN investigations inv ON c.investigation_id = inv.id
              WHERE c.user_id = ? AND c.monster_id = ? AND c.type = ? AND c.tempered = ? AND c.strength_rating = ?
              AND c.quest = 'Investigation Quests'
              ORDER BY remaining_uses ASC LIMIT 1`,
        args: [fm.host_id, fm.monster_id, fm.type, fm.tempered, fm.strength_rating]
      });
      const hc = invRes.rows[0];
      if (hc && hc.remaining_uses !== null) {
        const newUses = hc.remaining_uses - 1;
        if (newUses <= 0) {
          await db.execute({ sql: "DELETE FROM crowns WHERE id = ?", args: [hc.id] });
          if (hc.inv_id) await db.execute({ sql: "DELETE FROM investigations WHERE id = ?", args: [hc.inv_id] });
        } else if (hc.inv_id) {
          await db.execute({ sql: "UPDATE investigations SET remaining_uses = ? WHERE id = ?", args: [newUses, hc.inv_id] });
        } else {
          await db.execute({ sql: "UPDATE crowns SET remaining_uses = ? WHERE id = ?", args: [newUses, hc.id] });
        }
      }

      await db.execute({
        sql: "DELETE FROM active_missions WHERE group_id = ?",
        args: [mission.group_id]
      });

      if (interaction.client.pusher) {
        interaction.client.pusher.trigger("public-channel", "mission_update", { status: 'completed', groupId: mission.group_id }).catch(() => {});
        interaction.client.pusher.trigger("public-channel", "crown_update", {}).catch(() => {});
      }

      const embed = new EmbedBuilder()
        .setTitle(`${E.notesCheckmark} Group Quest Complete!`)
        .setDescription([
          `All hunters have confirmed the crown for ${mission.emoji || "🐉"} **${displayName}**!`,
          `> **Host:** <@${mission.host_id}>`,
          `> **Target:** ${typeEmoji} ${typeLabel}`,
          `> **Hunters:** ${groupRes.rows.map(m => `<@${m.requester_id}>`).join(", ")}`,
          "",
          `Congratulations to the whole party, Hunters!`,
        ].join("\n"))
        .setColor(0x2ECC71)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // --- Solo mission ---
    await db.execute({
      sql: "INSERT INTO completed_missions (host_id, requester_id, monster_id, type, tempered, strength_rating) VALUES (?, ?, ?, ?, ?, ?)",
      args: [mission.host_id, mission.requester_id, mission.monster_id, mission.type, mission.tempered, mission.strength_rating]
    });

    await db.execute({
      sql: "DELETE FROM active_missions WHERE id = ?",
      args: [mission.id]
    });

    // Deduct investigation use if applicable
    const soloInvRes = await db.execute({
      sql: `SELECT c.id, c.investigation_id,
                   COALESCE(inv.remaining_uses, c.remaining_uses) as remaining_uses,
                   inv.id as inv_id
            FROM crowns c
            LEFT JOIN investigations inv ON c.investigation_id = inv.id
            WHERE c.user_id = ? AND c.monster_id = ? AND c.type = ? AND c.tempered = ? AND c.strength_rating = ?
            AND c.quest = 'Investigation Quests'
            ORDER BY remaining_uses ASC LIMIT 1`,
      args: [mission.host_id, mission.monster_id, mission.type, mission.tempered, mission.strength_rating]
    });
    const soloHc = soloInvRes.rows[0];
    if (soloHc && soloHc.remaining_uses !== null) {
      const newUses = soloHc.remaining_uses - 1;
      if (newUses <= 0) {
        await db.execute({ sql: "DELETE FROM crowns WHERE id = ?", args: [soloHc.id] });
        if (soloHc.inv_id) await db.execute({ sql: "DELETE FROM investigations WHERE id = ?", args: [soloHc.inv_id] });
      } else if (soloHc.inv_id) {
        await db.execute({ sql: "UPDATE investigations SET remaining_uses = ? WHERE id = ?", args: [newUses, soloHc.inv_id] });
      } else {
        await db.execute({ sql: "UPDATE crowns SET remaining_uses = ? WHERE id = ?", args: [newUses, soloHc.id] });
      }
    }

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
      interaction.client.pusher.trigger("public-channel", "mission_update", { status: 'completed', hostId: mission.host_id, requesterId: mission.requester_id }).catch(() => {});
      interaction.client.pusher.trigger("public-channel", "crown_update", {}).catch(() => {});
    }

    await interaction.reply({ embeds: [embed] });
  },
};
