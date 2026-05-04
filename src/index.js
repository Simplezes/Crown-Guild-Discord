import { Client, GatewayIntentBits, Collection } from "discord.js";
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import db, { setupDatabase } from "./database.js";
import { pusherServer } from "./pusher.js";
import PusherClient from "pusher-js";

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

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const fileUrl = pathToFileURL(filePath).href;
  const { default: command } = await import(fileUrl);
  if ("data" in command && "execute" in command) {
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
              const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
              let targetName = row.monster_name.split(' ').map(capitalize).join(' ');
              if (row.tempered) targetName = `Tempered ${targetName}`;

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
                  .setLabel("✅ Accept Hunt")
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setLabel("View Profile")
                  .setURL(`https://crownguild.vercel.app/profile/${row.user_id}`)
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
              const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
              let targetName = row.monster_name.split(' ').map(capitalize).join(' ');
              if (row.tempered) targetName = `Tempered ${targetName}`;
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
                .setDescription(`<:MHWildsQuest_Members_Icon:1500270237323366400> **Host:** <@${row.host_id}>\n**Requester:** <@${row.user_id}>\n**Target:** ${row.emoji || "🐉"} **${targetName}** (${typeLabel})\n\n<:MHWildsLobby_Icon:1500270248647987300> ${lobbyInfo}${passInfo}\n\nOnce the mission is completed, please send \`/complete\`!`)
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
          const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
          let displayParts = row.monster_name.split(' ').map(capitalize).join(' ');
          if (row.tempered === 1) displayParts = `Tempered ${displayParts}`;
          displayParts = `${displayParts} - ${row.strength_rating}★`;
          const typeLabel = row.crown_type === 'small' ? "Small Crown" : "Large Crown";

          const lobbyInfo = row.lobby_id ? `**Lobby ID:** \`${row.lobby_id}\`` : "*Host, please share your Session ID!*";
          const passInfo = row.quest_password ? `\n**Password:** \`${row.quest_password}\`` : "";

          const embed = new EmbedBuilder()
            .setTitle("<:MHWildsHunt_Icon:1500270140682404001> Mission Undergoing!")
            .setDescription(`<:MHWildsQuest_Members_Icon:1500270237323366400> **Host:** <@${row.recipient_id}>\n**Requester:** <@${row.user_id}>\n**Target:** ${row.monster_emoji || "🐉"} **${displayParts}** (${typeLabel})\n\n<:MHWildsLobby_Icon:1500270248647987300> ${lobbyInfo}${passInfo}\n\nOnce the mission is completed, please send \`/complete\`!`)
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
            .setTitle("⌛ Request Cancelled")
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

async function start() {
  try {
    await setupDatabase();
    await client.login(process.env.DISCORD_TOKEN);
    runPollLoop();
    runSyncLoop();
    console.log("Bot started successfully with Pusher.");
  } catch (error) {
    console.error("Failed to start bot:", error);
  }
}

start();
