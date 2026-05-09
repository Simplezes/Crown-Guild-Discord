import { Client, GatewayIntentBits, Collection } from "discord.js";
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import db, { setupDatabase } from "./database.js";
import { pusherServer } from "./pusher.js";
import { refreshFlareEmbed } from "./events/interactionCreate.js";
import PusherClient from "pusher-js";
import { formatMonsterName } from "./utils.js";
import { E } from "./emojis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.pusher = pusherServer;

const pusherClient = new PusherClient.Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER
});

const channel = pusherClient.subscribe("public-channel");

channel.bind("notification_created", () => {
  console.log("Real-time notification created, polling now...");
  pollWebNotifications();
});

channel.bind("notification_updated", () => {
  console.log("Real-time notification updated, syncing now...");
  syncAcceptedToDiscord(true);
});

channel.bind("flare_updated", async (data) => {
  if ((data.type === 'join' || data.type === 'leave') && data.flareId) {
    refreshFlareEmbed(client, data.flareId);
  } else if (data.type === 'started' && data.discordMessageId && data.discordChannelId) {
    try {
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
      const channel = await client.channels.fetch(data.discordChannelId).catch(() => null);
      if (!channel) return;
      const msg = await channel.messages.fetch(data.discordMessageId).catch(() => null);
      if (!msg) return;

      const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      let displayName = data.monsterName.split(' ').map(capitalize).join(' ');
      if (data.tempered) displayName = `Tempered ${displayName}`;
      const typeLabel = data.crownType === 'small' ? "Small Crown" : "Large Crown";
      const hunterList = data.hunters?.length > 0
        ? data.hunters.map(h => `> ${E.questMembers} **${h}**`).join("\n")
        : "> *No hunters were in queue*";
      const lobbyLine = data.sessionId ? `> **Lobby ID:** \`${data.sessionId}\`` : "";

      const embed = new EmbedBuilder()
        .setTitle(`${E.hunt} Quest Started: ${displayName}!`)
        .setDescription([
          `**${data.hostName}** has launched the hunt for ${data.monsterEmoji} **${displayName}**!`,
          `> **Target:** ${typeLabel} (${data.strengthRating}★)`,
          lobbyLine,
          "",
          `**Strike Team (${data.hunters?.length ?? 0}/4):**`,
          hunterList,
          "",
          `Missions assigned. Use \`/hunt done\` when you get the crown!`,
        ].filter(Boolean).join("\n"))
        .setColor(0x2ECC71)
        .setTimestamp();

      const doneRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("quest_started_web").setLabel("Quest Started").setStyle(ButtonStyle.Success).setDisabled(true)
      );

      await msg.edit({ embeds: [embed], components: [doneRow], attachments: [] }).catch(() => {});
    } catch (e) {
      console.error("Error updating Discord embed on web start:", e);
    }
  } else if (data.type === 'close' && data.discordMessageId && data.discordChannelId) {
    try {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
      const ch = await client.channels.fetch(data.discordChannelId).catch(() => null);
      if (!ch) return;
      const msg = await ch.messages.fetch(data.discordMessageId).catch(() => null);
      if (!msg) return;
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("closed_web").setLabel("Flare Closed").setStyle(ButtonStyle.Danger).setDisabled(true)
      );
      await msg.edit({ components: [disabledRow], attachments: [] }).catch(() => {});
    } catch (e) {
      console.error("Error updating Discord embed on web close:", e);
    }
  }
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const fileUrl = pathToFileURL(filePath).href;
  const { default: command } = await import(fileUrl);
  if (command && command.data && typeof command.execute === "function") {
    client.commands.set(command.data.name, command);
  }
}

const eventsPath = path.join(__dirname, "events");
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const fileUrl = pathToFileURL(filePath).href;
  const { default: event } = await import(fileUrl);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

async function pollWebNotifications() {
  try {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
    const { E } = await import("./emojis.js");

    const res = await db.execute({
      sql: `
        SELECT n.*, u.username as requester_name, u_host.username as host_name,
               u.receive_dms as requester_dms, u_host.receive_dms as host_dms,
               m.name as monster_name, m.emoji, m.image_name, 
               c.type as crown_type, c.tempered, c.strength_rating 
        FROM web_notifications n 
        JOIN users u ON n.user_id = u.id 
        LEFT JOIN users u_host ON n.host_id = u_host.id
        JOIN monsters m ON n.monster_id = m.id 
        JOIN crowns c ON n.crown_id = c.id 
        WHERE n.status = 'pending' LIMIT 5
      `,
    });

    for (const row of res.rows) {
      try {
        await pusherServer.trigger("public-channel", "notification", {
          id: row.id,
          type: row.type,
          requester_name: row.requester_name,
          host_name: row.host_name,
          host_id: row.host_id,
          user_id: row.user_id,
          recipient_id: row.recipient_id,
          monster_name: row.monster_name,
          monster_image: row.image_name,
          crown_type: row.crown_type,
          tempered: row.tempered,
          strength_rating: row.strength_rating,
          created_at: row.created_at
        });

        let discordMsgId = null;
        let discordChanId = null;

        if (row.type === 'beacon' || row.type === 'sos_flare') {
          if (row.host_dms !== 0) {
            const host = await client.users.fetch(row.host_id).catch(() => null);
            if (host) {
              const targetName = formatMonsterName(row.monster_name, row.tempered);
              const typeLabel = row.crown_type === 'small' ? "Small Crown" : "Large Crown";
              const typeEmoji = row.crown_type === 'small' ? E.smallCrown : E.largeCrown;

              const embed = new EmbedBuilder()
                .setTitle(`${E.linkParty} SOS Beacon Received!`)
                .setDescription(`**${row.requester_name}** has sent an SOS flare for your ${row.emoji} **${targetName}** (${typeEmoji} ${typeLabel}) on the website!`)
                .addFields({ name: "Action Required", value: "Click below to accept this request and start the mission." })
                .setColor(0xE67E22)
                .setTimestamp();

              const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`accept_req_${row.monster_id}_${row.crown_type}_${row.user_id}`)
                  .setLabel("Accept Hunt")
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setLabel("View Profile")
                  .setURL(`${process.env.WEB_HUB_URL}/profile/${row.user_id}`)
                  .setStyle(ButtonStyle.Link)
              );

              const msg = await host.send({ embeds: [embed], components: [buttons] }).catch(() => null);
              if (msg) {
                discordMsgId = msg.id;
                discordChanId = msg.channelId;
              }
            }
          }
        } else if (row.type === 'hunt_accepted') {
          if (row.requester_dms !== 0) {
            const requester = await client.users.fetch(row.user_id).catch(() => null);
            if (requester) {
              let targetName = formatMonsterName(row.monster_name, row.tempered);
              targetName = `${targetName} - ${row.strength_rating}★`;
              
              const typeLabel = row.crown_type === 'small' ? "Small Crown" : "Large Crown";
              
              const userRes = await db.execute({
                sql: "SELECT lobby_id, quest_password FROM users WHERE id = ?",
                args: [row.host_id]
              });
              const hostData = userRes.rows[0] || {};
              const lobbyInfo = hostData.lobby_id ? `**Lobby ID:** \`${hostData.lobby_id}\`` : "*Host, please share your Session ID!*";
              const passInfo = hostData.quest_password ? `\n**Password:** \`${hostData.quest_password}\`` : "";

              const embed = new EmbedBuilder()
                .setTitle("<:MHWildsHunt_Icon:1500270140682404001> Mission Undergoing!")
                .setDescription(`<:MHWildsQuest_Members_Icon:1500270237323366400> **Host:** <@${row.host_id}>\n**Requester:** <@${row.user_id}>\n**Target:** ${row.emoji || E.hunt} **${targetName}** (${typeLabel})\n\n<:MHWildsLobby_Icon:1500270248647987300> ${lobbyInfo}${passInfo}\n\nOnce the mission is completed, please send \`/complete\`!`)
                .setColor(0x3498DB)
                .setTimestamp();
              
              const msg = await requester.send({ embeds: [embed] }).catch(() => null);
              if (msg) {
                discordMsgId = msg.id;
                discordChanId = msg.channelId;
              }
            }
          }
        }

        await db.execute({
          sql: "UPDATE web_notifications SET status = 'sent', discord_message_id = ?, discord_channel_id = ? WHERE id = ?",
          args: [discordMsgId, discordChanId, row.id]
        });
      } catch (err) {
        console.error("Error processing notification:", err);
      }
    }
  } catch (error) {
    console.error("Polling error:", error);
  }
}

async function runPollLoop() {
  await pollWebNotifications();
  setTimeout(runPollLoop, 30000);
}

async function syncAcceptedToDiscord() {
  try {
    const { EmbedBuilder } = await import("discord.js");
    const res = await db.execute({
      sql: `SELECT n.*, m.name as monster_name, m.emoji as monster_emoji, c.type as crown_type, c.tempered, c.strength_rating,
                   u_host.lobby_id, u_host.quest_password
            FROM web_notifications n 
            JOIN monsters m ON n.monster_id = m.id 
            JOIN crowns c ON n.crown_id = c.id 
            JOIN users u_host ON n.recipient_id = u_host.id
            WHERE n.status IN ('accepted', 'declined', 'cancelled') AND n.discord_message_id IS NOT NULL`
    });

    for (const row of res.rows) {
      try {
        const channel = await client.channels.fetch(row.discord_channel_id).catch(() => null);
        if (!channel) continue;
        const msg = await channel.messages.fetch(row.discord_message_id).catch(() => null);
        if (!msg) continue;

        if (row.status === 'accepted') {
          let displayParts = formatMonsterName(row.monster_name, row.tempered === 1);
          displayParts = `${displayParts} - ${row.strength_rating}★`;
          const typeLabel = row.crown_type === 'small' ? "Small Crown" : "Large Crown";

          const lobbyInfo = row.lobby_id ? `**Lobby ID:** \`${row.lobby_id}\`` : "*Host, please share your Session ID!*";
          const passInfo = row.quest_password ? `\n**Password:** \`${row.quest_password}\`` : "";

          const embed = new EmbedBuilder()
            .setTitle("<:MHWildsHunt_Icon:1500270140682404001> Mission Undergoing!")
            .setDescription(`<:MHWildsQuest_Members_Icon:1500270237323366400> **Host:** <@${row.recipient_id}>\n**Requester:** <@${row.user_id}>\n**Target:** ${row.monster_emoji || E.hunt} **${displayParts}** (${typeLabel})\n\n<:MHWildsLobby_Icon:1500270248647987300> ${lobbyInfo}${passInfo}\n\nOnce the mission is completed, please send \`/complete\`!`)
            .setColor(0x3498DB)
            .setTimestamp();

          await msg.edit({ embeds: [embed], components: [] }).catch(() => { });
        } else if (row.status === 'declined') {
          const embed = new EmbedBuilder()
            .setTitle("<:MHWildsNotes_Checkmark_Icon:1500270149725327370> Hunt Request Declined")
            .setDescription(`The host has declined the hunt request for **${row.monster_name}**.`)
            .setColor(0xE74C3C)
            .setTimestamp();
          await msg.edit({ embeds: [embed], components: [] }).catch(() => { });
        } else if (row.status === 'cancelled') {
          const embed = new EmbedBuilder()
            .setTitle("Request Cancelled")
            .setDescription(`This SOS flare for **${row.monster_name}** is no longer active. Another host may have accepted it.`)
            .setColor(0x95A5A6)
            .setTimestamp();
          await msg.edit({ embeds: [embed], components: [] }).catch(() => { });
        }

        await db.execute({
          sql: "UPDATE web_notifications SET discord_message_id = NULL WHERE id = ?",
          args: [row.id]
        });
      } catch (e) {
        console.error("Error updating Discord message:", e);
      }
    }
  } catch (err) {
    console.error("Error in syncAcceptedToDiscord:", err);
  }
}

async function runSyncLoop() {
  await syncAcceptedToDiscord();
  setTimeout(runSyncLoop, 30000);
}

async function checkExpiredMissions() {
  try {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");

    const res = await db.execute({
      sql: `SELECT am.*, u.username as requester_name, u.receive_dms,
                   u_host.username as host_name, u_host.receive_dms as host_dms,
                   mon.name as monster_name, mon.emoji
            FROM active_missions am
            JOIN users u ON am.requester_id = u.id
            JOIN users u_host ON am.host_id = u_host.id
            JOIN monsters mon ON am.monster_id = mon.id
            WHERE am.expiry_notified = 0
            AND am.created_at <= datetime('now', '-50 minutes')`
    });

    if (res.rows.length === 0) return;

    for (const mission of res.rows) {
      await db.execute({ sql: "UPDATE active_missions SET expiry_notified = 1 WHERE id = ?", args: [mission.id] });
    }

    for (const mission of res.rows) {
      if (mission.receive_dms === 0) continue;

      const displayName = formatMonsterName(mission.monster_name, mission.tempered);
      const typeLabel = mission.type === 'small' ? "Small Crown" : "Large Crown";

      const embed = new EmbedBuilder()
        .setTitle("Quest Timer Expired")
        .setDescription([
          `Your quest timer has expired for ${mission.emoji || E.hunt} **${displayName}** (${typeLabel}).`,
          `> **Host:** ${mission.host_name}`,
          "",
          `Did you complete the hunt and get the crown?`
        ].join("\n"))
        .setColor(0xE67E22)
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`quest_timeout_yes_${mission.id}`)
          .setLabel("Yes, Got The Crown")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`quest_timeout_no_${mission.id}`)
          .setLabel("No, Did Not Complete")
          .setStyle(ButtonStyle.Danger)
      );

      const user = await client.users.fetch(mission.requester_id).catch(() => null);
      if (user) await user.send({ embeds: [embed], components: [buttons] }).catch(() => {});
    }

    const notifiedHosts = new Set();
    for (const mission of res.rows) {
      if (!mission.group_id || notifiedHosts.has(mission.host_id)) continue;
      notifiedHosts.add(mission.host_id);
      if (mission.host_dms === 0) continue;

      const displayName = formatMonsterName(mission.monster_name, mission.tempered);
      const typeLabel = mission.type === 'small' ? "Small Crown" : "Large Crown";

      const embed = new EmbedBuilder()
        .setTitle("Group Quest Timer Expired")
        .setDescription([
          `Your hosted group quest for ${mission.emoji || E.hunt} **${displayName}** (${typeLabel}) has expired.`,
          "",
          `Hunters have been prompted to confirm if they completed the hunt.`
        ].join("\n"))
        .setColor(0xE67E22)
        .setTimestamp();

      const host = await client.users.fetch(mission.host_id).catch(() => null);
      if (host) await host.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error("Error checking expired missions:", err);
  }
}

async function runExpireLoop() {
  await checkExpiredMissions();
  setTimeout(runExpireLoop, 5 * 60 * 1000);
}

async function start() {
  try {
    await setupDatabase();
    await client.login(process.env.DISCORD_TOKEN);
    runPollLoop();
    runSyncLoop();
    runExpireLoop();
    console.log("Bot started successfully with Pusher.");
  } catch (error) {
    console.error("Failed to start bot:", error);
  }
}

start();
