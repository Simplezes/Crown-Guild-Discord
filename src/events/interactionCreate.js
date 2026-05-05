import { Events } from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";
import { buildFlareEmbed, buildFlareButtons } from "../logic/flare.js";

async function refreshFlareEmbed(client, flareId) {
  try {
    const flareRes = await db.execute({
      sql: `SELECT f.*, u.username as host_name, m.name as monster_name, m.emoji, u2.lobby_id,
                   f.discord_message_id, f.discord_channel_id
            FROM active_flares f
            JOIN users u ON f.host_id = u.id
            JOIN monsters m ON f.monster_id = m.id
            LEFT JOIN users u2 ON f.host_id = u2.id
            WHERE f.id = ?`,
      args: [flareId]
    });
    if (!flareRes.rows[0]?.discord_message_id) return;

    const flare = flareRes.rows[0];
    const membersRes = await db.execute({
      sql: "SELECT u.username FROM active_flare_queue q JOIN users u ON q.user_id = u.id WHERE q.flare_id = ?",
      args: [flareId]
    });

    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    let displayName = flare.monster_name.split(' ').map(capitalize).join(' ');
    if (flare.tempered) displayName = `Tempered ${displayName}`;
    const typeLabel = flare.type === 'small' ? "Small Crown" : "Large Crown";
    const { E: Emojis } = await import("../emojis.js");
    const typeEmoji = flare.type === 'small' ? Emojis.smallCrown : Emojis.largeCrown;

    const embed = buildFlareEmbed({
      displayName, monsterEmoji: flare.emoji, typeEmoji, typeLabel,
      strengthRating: flare.strength_rating,
      hostUsername: flare.host_name,
      sessionId: flare.session_id,
      members: membersRes.rows,
    });

    const channel = await client.channels.fetch(flare.discord_channel_id).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(flare.discord_message_id).catch(() => null);
    if (!msg) return;

    await msg.edit({ embeds: [embed], components: [buildFlareButtons(flareId)] }).catch(() => { });
  } catch (e) {
    console.error("Error refreshing flare embed:", e);
  }
}

async function syncUser(interaction) {
  try {
    const userId = interaction.user.id;
    const username = interaction.user.globalName || interaction.user.username;
    const avatarUrl = interaction.user.displayAvatarURL();

    await db.execute({
      sql: "INSERT INTO users (id, username, avatar_url) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url",
      args: [userId, username, avatarUrl]
    });
  } catch (e) {
    console.error("Failed to sync user info to DB", e);
  }
}

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    await syncUser(interaction);

    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        const { MessageFlags } = await import("discord.js");
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: "There was an error while executing this command!", flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: "There was an error while executing this command!", flags: MessageFlags.Ephemeral });
        }
      }
    } else if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(error);
      }
    } else if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId.startsWith("page_prev_") || customId.startsWith("page_next_")) {
        const parts = customId.split("_");
        const direction = parts[1];
        const currentPage = parseInt(parts[2]);
        const totalPages = parseInt(parts[3]);
        const stateKey = parts.slice(4).join("_");

        const newPage = direction === "prev" ? currentPage - 1 : currentPage + 1;

        const { buildPage, PAGE_SIZE } = await import("../pagination.js");
        const { MessageFlags } = await import("discord.js");
        const path = await import("path");
        const fs = await import("fs");

        let entries = [];
        let title = "";
        let opts = {};

        if (stateKey.startsWith("list_")) {
          const userId = stateKey.replace("list_", "");
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

          const collection = {};
          res.rows.forEach((row) => {
            let keyName = row.name;
            if (row.tempered) keyName = `Tempered ${row.name}`;
            if (!collection[keyName]) collection[keyName] = { emojis: [], monsterEmoji: row.emoji || "🐉" };
            const crownEmoji = row.type === "small" ? "<:smallcrown:1500245360323465386> `Small`" : "<:largecrown:1500245422210420829> `Large`";
            const questLabel = row.quest ? ` (${row.quest})` : "";
            collection[keyName].emojis.push(`${crownEmoji}${questLabel}`);
          });

          const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
          entries = Object.entries(collection).map(([name, data]) => {
            const displayName = name.split(" ").map(capitalize).join(" ");
            return `**${data.monsterEmoji} ${displayName}**\n> ${data.emojis.join("  •  ")}`;
          });

          const iconPath = path.join(process.cwd(), "icon.png");
          const files = fs.existsSync(iconPath) ? [{ attachment: iconPath, name: "icon.png" }] : [];

          const target = await interaction.client.users.fetch(userId).catch(() => null);
          const targetName = target ? target.username : "Hunter";
          const targetAvatar = target ? target.displayAvatarURL() : undefined;

          opts = {
            color: 0xC4982A,
            authorName: `${targetName}  •  Crown Collection`,
            authorIconUrl: targetAvatar,
            thumbnailUrl: "attachment://icon.png",
            footerSuffix: `${Object.keys(collection).length} monsters tracked`,
            footerIconUrl: targetAvatar,
            stateKey,
            files,
          };

          const { embeds, components } = buildPage(null, entries, newPage, opts);
          return interaction.update({ embeds, components, files: opts.files });

        } else if (stateKey === "find_all") {
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

          const capitalize2 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
          entries = Object.entries(grouped).map(([name, data]) => {
            const displayParts = name.split(" ").map(capitalize2).join(" ");
            const smallLine = data.small.length > 0
              ? `> <:smallcrown:1500245360323465386> **${data.small.length}** hunter${data.small.length !== 1 ? "s" : ""}`
              : `> <:smallcrown:1500245360323465386> *None*`;
            const largeLine = data.large.length > 0
              ? `> <:largecrown:1500245422210420829> **${data.large.length}** hunter${data.large.length !== 1 ? "s" : ""}`
              : `> <:largecrown:1500245422210420829> *None*`;
            return `**${data.emoji}  ${displayParts}**\n${smallLine}\n${largeLine}`;
          });

          const iconPath2 = path.join(process.cwd(), "icon.png");
          const files2 = fs.existsSync(iconPath2) ? [{ attachment: iconPath2, name: "icon.png" }] : [];

          opts = {
            color: 0xC4982A,
            authorName: "Crown Guild  •  Crown Registry",
            authorIconUrl: "attachment://icon.png",
            thumbnailUrl: "attachment://icon.png",
            footerSuffix: "Use /hunt find monster: to see holders & request a crown",
            stateKey,
            files: files2,
          };
          const { embeds, components } = buildPage(null, entries, newPage, opts);
          return interaction.update({ embeds, components, files: files2 });
        }

      } else if (customId.startsWith("join_flare_")) {
        const flareId = parseInt(customId.split("_")[2]);
        const userId = interaction.user.id;

        const flareRes = await db.execute({ sql: "SELECT id, host_id FROM active_flares WHERE id = ?", args: [flareId] });
        if (flareRes.rows.length === 0) {
          const { MessageFlags } = await import("discord.js");
          return interaction.reply({ content: "This SOS flare has expired or been closed.", flags: MessageFlags.Ephemeral });
        }
        if (flareRes.rows[0].host_id === userId) {
          const { MessageFlags } = await import("discord.js");
          return interaction.reply({ content: "You are the host — you can't join your own flare!", flags: MessageFlags.Ephemeral });
        }

        try {
          await db.execute({ sql: "INSERT INTO active_flare_queue (flare_id, user_id) VALUES (?, ?)", args: [flareId, userId] });
          await interaction.client.pusher.trigger("public-channel", "flare_updated", { type: 'join' }).catch(() => { });
          await refreshFlareEmbed(interaction.client, flareId);
          const { MessageFlags } = await import("discord.js");
          return interaction.reply({ content: "✅ Joined the strike team queue!", flags: MessageFlags.Ephemeral });
        } catch (e) {
          const { MessageFlags } = await import("discord.js");
          return interaction.reply({ content: "You are already in this queue.", flags: MessageFlags.Ephemeral });
        }

      } else if (customId.startsWith("leave_flare_")) {
        const flareId = parseInt(customId.split("_")[2]);
        const userId = interaction.user.id;

        await db.execute({ sql: "DELETE FROM active_flare_queue WHERE flare_id = ? AND user_id = ?", args: [flareId, userId] });
        await interaction.client.pusher.trigger("public-channel", "flare_updated", { type: 'leave' }).catch(() => { });
        await refreshFlareEmbed(interaction.client, flareId);
        const { MessageFlags } = await import("discord.js");
        return interaction.reply({ content: "🚪 You've left the queue.", flags: MessageFlags.Ephemeral });

      } else if (customId.startsWith("close_flare_")) {
        const flareId = parseInt(customId.split("_")[2]);
        const userId = interaction.user.id;

        const flareRes = await db.execute({ sql: "SELECT host_id FROM active_flares WHERE id = ?", args: [flareId] });
        if (flareRes.rows.length === 0) {
          const { MessageFlags } = await import("discord.js");
          return interaction.reply({ content: "This flare is already closed.", flags: MessageFlags.Ephemeral });
        }
        if (flareRes.rows[0].host_id !== userId) {
          const { MessageFlags } = await import("discord.js");
          return interaction.reply({ content: "Only the host can close this flare.", flags: MessageFlags.Ephemeral });
        }

        await db.execute({ sql: "DELETE FROM active_flares WHERE id = ?", args: [flareId] });
        await interaction.client.pusher.trigger("public-channel", "flare_updated", { type: 'close' }).catch(() => { });

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = await import("discord.js");
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`closed_1`).setLabel("Flare Closed").setStyle(ButtonStyle.Danger).setDisabled(true)
        );
        await interaction.update({ components: [disabledRow] }).catch(() => { });
        return;

      } else if (customId.startsWith("accept_req_") || customId.startsWith("host_choose_")) {
        const parts = customId.split("_");
        const isChoose = customId.startsWith("host_choose_");

        if (!isChoose && parts.length !== 5) return;
        if (isChoose && parts.length !== 7) return;

        const monsterId = isChoose ? parts[2] : parts[2];
        const type = isChoose ? parts[3] : parts[3];
        const requesterId = isChoose ? parts[4] : parts[4];
        const explicitTempered = isChoose ? parseInt(parts[5]) : null;
        const msgId = isChoose ? parts[6] : null;
        const hostId = interaction.user.id;

        const { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");

        if (hostId === requesterId) {
          return interaction.reply({ content: "You cannot accept your own request.", flags: MessageFlags.Ephemeral });
        }

        const crownArgs = explicitTempered !== null
          ? [hostId, Number(monsterId), type, explicitTempered]
          : [hostId, Number(monsterId), type];
        const crownSql = `
          SELECT id, strength_rating, remaining_uses, tempered, quest 
          FROM crowns 
          WHERE user_id = ? AND monster_id = ? AND type = ? 
          ${explicitTempered !== null ? 'AND tempered = ?' : ''}
          ORDER BY tempered DESC, remaining_uses DESC, strength_rating DESC
        `;

        const crownRes = await db.execute({ sql: crownSql, args: crownArgs });

        if (crownRes.rows.length === 0) {
          return interaction.reply({ content: "You do not have this crown in your list.", flags: MessageFlags.Ephemeral });
        }

        if (!isChoose) {
          const hasTempered = crownRes.rows.some(r => r.tempered === 1);
          const hasNormal = crownRes.rows.some(r => r.tempered === 0);

          if (hasTempered && hasNormal) {
            const bestTempered = crownRes.rows.find(r => r.tempered === 1);
            const bestNormal = crownRes.rows.find(r => r.tempered === 0);

            const monsterResPrompt = await db.execute({
              sql: "SELECT name, emoji FROM monsters WHERE id = ?",
              args: [monsterId]
            });
            const mData = monsterResPrompt.rows[0];
            const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
            const mName = mData.name.split(' ').map(capitalize).join(' ');
            const mEmoji = mData.emoji || "🐉";
            const typeEmoji = type === "small" ? E.smallCrown : E.largeCrown;
            const typeLabel = type === "small" ? "Small Crown" : "Large Crown";

            const formatCrown = (c) => {
              const uses = c.quest === "Investigation Quests" && c.remaining_uses !== null ? ` (${c.remaining_uses} uses)` : "";
              const quest = c.quest ? `*${c.quest}*${uses}` : "*No quest specified*";
              return `> **Strength:** ${c.strength_rating}★\n> **Quest:** ${quest}`;
            };

            const promptEmbed = new EmbedBuilder()
              .setTitle(`${mEmoji} Host Selection: ${mName}`)
              .setDescription(`You own multiple versions of the ${typeEmoji} **${typeLabel}** for this monster.\nSelect which one you want to host for <@${requesterId}>:`)
              .setColor(0xC4982A)
              .addFields(
                { name: `${typeEmoji} Normal Crown`, value: formatCrown(bestNormal), inline: true },
                { name: `${E.tempered} Tempered Crown`, value: formatCrown(bestTempered), inline: true }
              );

            const originalMsgId = interaction.message.id;
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`host_choose_${monsterId}_${type}_${requesterId}_0_${originalMsgId}`)
                .setLabel("Host Normal Crown")
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`host_choose_${monsterId}_${type}_${requesterId}_1_${originalMsgId}`)
                .setLabel("Host Tempered Crown")
                .setStyle(ButtonStyle.Secondary)
            );

            return interaction.reply({
              embeds: [promptEmbed],
              components: [row],
              flags: MessageFlags.Ephemeral
            });
          }
        }

        await interaction.deferUpdate();

        const selectedCrown = crownRes.rows[0];

        const requesterCheck = await db.execute({
          sql: "SELECT 1 FROM active_missions WHERE requester_id = ?",
          args: [requesterId]
        });
        if (requesterCheck.rows.length > 0) {
          return interaction.followUp({
            content: "This hunter already has an active mission in progress! They must use `/hunt done` first.",
            flags: MessageFlags.Ephemeral
          });
        }

        await db.execute({ sql: "INSERT OR IGNORE INTO users(id) VALUES (?)", args: [hostId] });
        await db.execute({ sql: "INSERT OR IGNORE INTO users(id) VALUES (?)", args: [requesterId] });

        await db.execute({
          sql: "INSERT INTO active_missions (host_id, requester_id, monster_id, type, tempered, strength_rating) VALUES (?, ?, ?, ?, ?, ?)",
          args: [hostId, requesterId, monsterId, type, selectedCrown.tempered, selectedCrown.strength_rating]
        });

        const pendingNotif = await db.execute({
          sql: "SELECT id FROM web_notifications WHERE user_id = ? AND host_id = ? AND monster_id = ? AND status IN ('sent', 'pending') LIMIT 1",
          args: [requesterId, hostId, Number(monsterId)]
        });
        const notifId = pendingNotif.rows.length > 0 ? pendingNotif.rows[0].id : null;

        await db.execute({
          sql: "UPDATE web_notifications SET status = 'accepted' WHERE user_id = ? AND host_id = ? AND monster_id = ? AND status IN ('sent', 'pending')",
          args: [requesterId, hostId, Number(monsterId)]
        });

        await db.execute({
          sql: "UPDATE web_notifications SET status = 'cancelled' WHERE user_id = ? AND status IN ('pending', 'sent') AND type IN ('sos_flare', 'beacon')",
          args: [requesterId]
        });
        if (interaction.client.pusher) interaction.client.pusher.trigger('public-channel', 'notification_updated', {});

        await db.execute({
          sql: `INSERT INTO web_notifications (user_id, host_id, recipient_id, type, monster_id, crown_id, status) 
                VALUES (?, ?, ?, 'hunt_accepted', ?, (SELECT id FROM crowns WHERE user_id = ? AND monster_id = ? AND type = ? LIMIT 1), 'pending')`,
          args: [requesterId, hostId, requesterId, Number(monsterId), hostId, Number(monsterId), type]
        });

        if (interaction.client.pusher) {
          interaction.client.pusher.trigger("public-channel", "notification_remove", {
            id: notifId,
            user_id: requesterId,
            monster_id: Number(monsterId)
          });
          interaction.client.pusher.trigger("public-channel", "notification", {
            type: 'hunt_accepted',
            recipient_id: requesterId
          });
          interaction.client.pusher.trigger("public-channel", "mission_update", {});
          interaction.client.pusher.trigger("public-channel", "crown_update", {});
        }

        const monsterRes = await db.execute({
          sql: "SELECT name, emoji FROM monsters WHERE id = ?",
          args: [monsterId]
        });
        const m = monsterRes.rows[0];
        const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
        let displayParts = m.name.split(' ').map(capitalize).join(' ');
        if (selectedCrown.tempered === 1) displayParts = `Tempered ${displayParts}`;
        displayParts = `${displayParts} - ${selectedCrown.strength_rating}★`;
        const typeLabel = type === "small" ? "Small Crown" : "Large Crown";

        const userRes = await db.execute({
          sql: "SELECT lobby_id, quest_password FROM users WHERE id = ?",
          args: [hostId]
        });
        const hostData = userRes.rows[0] || {};
        const lobbyInfo = hostData.lobby_id ? `**Lobby ID:** \`${hostData.lobby_id}\`` : "*Host, please share your Session ID!*";
        const passInfo = hostData.quest_password ? `\n**Password:** \`${hostData.quest_password}\`` : "";

        const embed = new EmbedBuilder()
          .setTitle("<:MHWildsHunt_Icon:1500270140682404001> Mission Undergoing!")
          .setDescription(`<:MHWildsQuest_Members_Icon:1500270237323366400> **Host:** <@${hostId}>\n**Requester:** <@${requesterId}>\n**Target:** ${m.emoji || "🐉"} **${displayParts}** (${typeLabel})\n\n<:MHWildsLobby_Icon:1500270248647987300> ${lobbyInfo}${passInfo}\n\nOnce the mission is completed, please send \`/hunt done\`!`)
          .setColor(0x3498DB);

        if (isChoose) {
          try {
            const originalMsg = await interaction.channel.messages.fetch(msgId);
            await originalMsg.edit({ embeds: [embed], components: [] });
            await interaction.editReply({ content: `Started mission for ${displayParts}!`, components: [] });
          } catch (err) {
            console.error("Failed to edit original message:", err);
            await interaction.followUp({ content: "Mission started, but failed to update the original request message.", flags: MessageFlags.Ephemeral });
          }
        } else {
          await interaction.editReply({ embeds: [embed], components: [] });
        }
      } else if (customId.startsWith("confirm_remove_all_")) {
        const ownerId = customId.replace("confirm_remove_all_", "");
        if (interaction.user.id !== ownerId) {
          const { MessageFlags } = await import("discord.js");
          return interaction.reply({ content: "This confirmation is not for you.", flags: MessageFlags.Ephemeral });
        }

        await db.execute({
          sql: "UPDATE web_notifications SET crown_id = NULL WHERE host_id = ?",
          args: [ownerId]
        });

        const res = await db.execute({
          sql: "DELETE FROM crowns WHERE user_id = ?",
          args: [ownerId]
        });

        const { EmbedBuilder } = await import("discord.js");
        const embed = new EmbedBuilder()
          .setTitle("Collection Cleared")
          .setDescription(`All **${res.rowsAffected}** crowns have been permanently deleted from your collection.`)
          .setColor(0xed4245);

        await interaction.update({ embeds: [embed], components: [] });
        if (interaction.client.pusher) {
          interaction.client.pusher.trigger("public-channel", "crown_update", {});
        }

      } else if (customId.startsWith("cancel_remove_all_")) {
        const ownerId = customId.replace("cancel_remove_all_", "");
        if (interaction.user.id !== ownerId) {
          const { MessageFlags } = await import("discord.js");
          return interaction.reply({ content: "This confirmation is not for you.", flags: MessageFlags.Ephemeral });
        }

        const { EmbedBuilder } = await import("discord.js");
        const embed = new EmbedBuilder()
          .setTitle("Cancelled")
          .setDescription("Your collection is safe. No crowns were removed.")
          .setColor(0x95A5A6);

        await interaction.update({ embeds: [embed], components: [] });
      } else if (customId.startsWith("confirm_delete_account_init_")) {
        const ownerId = customId.replace("confirm_delete_account_init_", "");
        if (interaction.user.id !== ownerId) {
          const { MessageFlags } = await import("discord.js");
          return interaction.reply({ content: "This action is not for you.", flags: MessageFlags.Ephemeral });
        }

        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
        const embed = new EmbedBuilder()
          .setTitle("⚠️ Final Warning: Account Deletion")
          .setDescription("This will permanently delete your entire profile, including all collected crowns and mission history. **This cannot be undone.**\n\nAre you absolutely sure?")
          .setColor(0xED4245);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_delete_account_final_${ownerId}`)
            .setLabel("Yes, Delete Everything")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`cancel_delete_account_${ownerId}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });

      } else if (customId.startsWith("confirm_delete_account_final_")) {
        const ownerId = customId.replace("confirm_delete_account_final_", "");
        if (interaction.user.id !== ownerId) {
          const { MessageFlags } = await import("discord.js");
          return interaction.reply({ content: "This action is not for you.", flags: MessageFlags.Ephemeral });
        }

        await db.batch([
          { sql: "DELETE FROM web_notifications WHERE user_id = ? OR host_id = ? OR recipient_id = ?", args: [ownerId, ownerId, ownerId] },
          { sql: "DELETE FROM active_missions WHERE host_id = ? OR requester_id = ?", args: [ownerId, ownerId] },
          { sql: "DELETE FROM completed_missions WHERE host_id = ? OR requester_id = ?", args: [ownerId, ownerId] },
          { sql: "DELETE FROM crowns WHERE user_id = ?", args: [ownerId] },
          { sql: "DELETE FROM users WHERE id = ?", args: [ownerId] }
        ], "write");

        const { EmbedBuilder } = await import("discord.js");
        const embed = new EmbedBuilder()
          .setTitle("Account Deleted")
          .setDescription("Your account and all associated data have been removed from the Guild Registry.")
          .setColor(0x2B2D31);

        await interaction.update({ embeds: [embed], components: [] });
        if (interaction.client.pusher) {
          interaction.client.pusher.trigger("public-channel", "crown_update", {});
          interaction.client.pusher.trigger("public-channel", "mission_update", {});
        }

      } else if (customId.startsWith("join_flare_")) {
        const flareId = parseInt(customId.replace("join_flare_", ""));
        const userId = interaction.user.id;

        const { MessageFlags, EmbedBuilder } = await import("discord.js");

        const flareRes = await db.execute({
          sql: `SELECT f.*, u.username as host_name, m.name as monster_name, m.emoji 
                FROM active_flares f 
                JOIN users u ON f.host_id = u.id 
                JOIN monsters m ON f.monster_id = m.id 
                WHERE f.id = ?`,
          args: [flareId]
        });

        if (flareRes.rows.length === 0) {
          return interaction.reply({ content: "This flare has expired or been removed.", flags: MessageFlags.Ephemeral });
        }

        const flare = flareRes.rows[0];
        if (flare.host_id === userId) {
          return interaction.reply({ content: "You cannot join your own flare queue!", flags: MessageFlags.Ephemeral });
        }

        try {
          await db.execute({
            sql: "INSERT INTO flare_queue (flare_id, user_id) VALUES (?, ?)",
            args: [flareId, userId]
          });
        } catch (e) {
          return interaction.reply({ content: "You are already in the queue for this flare!", flags: MessageFlags.Ephemeral });
        }

        const queueRes = await db.execute({
          sql: "SELECT user_id FROM flare_queue WHERE flare_id = ? ORDER BY created_at ASC",
          args: [flareId]
        });

        const queueList = queueRes.rows.map((r, i) => `${i + 1}. <@${r.user_id}>`).join("\n");

        const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
        let displayName = flare.monster_name.split(' ').map(capitalize).join(' ');
        if (flare.tempered) displayName = `Tempered ${displayName}`;
        const typeLabel = flare.type === 'small' ? "Small Crown" : "Large Crown";
        const typeEmoji = flare.type === 'small' ? (flare.type === 'small' ? E.smallCrown : E.largeCrown) : "👑";

        const oldEmbed = interaction.message.embeds[0];
        const embed = EmbedBuilder.from(oldEmbed)
          .setDescription([
            `**${flare.host_name}** is hosting a hunt for ${flare.emoji} **${displayName}**!`,
            `> **Target:** ${typeEmoji} ${typeLabel} (${flare.strength_rating}★)`,
            `> **Status:** Waiting for hunters...`,
            "",
            `**Queue:**`,
            queueList,
            "",
            `Click the button below to join the queue! The host will see your interest.`,
          ].join("\n"));

        await interaction.update({ embeds: [embed] });
      } else if (customId.startsWith("cancel_delete_account_")) {
        const ownerId = customId.replace("cancel_delete_account_", "");
        if (interaction.user.id !== ownerId) {
          const { MessageFlags } = await import("discord.js");
          return interaction.reply({ content: "This action is not for you.", flags: MessageFlags.Ephemeral });
        }

        const { EmbedBuilder } = await import("discord.js");
        const embed = new EmbedBuilder()
          .setTitle("Deletion Cancelled")
          .setDescription("Your account is safe.")
          .setColor(0x95A5A6);

        await interaction.update({ embeds: [embed], components: [] });
      }
    }
  },
};
