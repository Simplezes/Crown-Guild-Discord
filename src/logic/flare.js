import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import db from "../database.js";
import { handleMyCrownedMonsterAutocomplete, resolveMonsterName, capitalize, formatMonsterName } from "../utils.js";
import { E } from "../emojis.js";
import { ephemeralStatus } from "../responseEmbeds.js";

const WEB_HUB_URL = process.env.WEB_HUB_URL;

export function buildFlareEmbed({ displayName, monsterEmoji, typeEmoji, typeLabel, strengthRating, hostUsername, sessionId, members = [] }) {
  const memberLines = members.length > 0
    ? members.map(m => `> ${E.questMembers} **${m.username}**`).join("\n")
    : `> *No hunters in queue yet...*`;

  return new EmbedBuilder()
    .setTitle(`${E.linkParty} SOS Flare: ${displayName}!`)
    .setDescription([
      `**${hostUsername}** is hosting for ${monsterEmoji} **${displayName}**`,
      `> **Target:** ${typeEmoji} ${typeLabel} (${strengthRating}★)`,
      `> **Lobby ID:** \`${sessionId}\``,
      "",
      `**Strike Team Queue (${members.length}):**`,
      memberLines,
      "",
      `[${E.communication} View on Crown Guild Hub](${WEB_HUB_URL})`,
    ].join("\n"))
    .setColor(0xFF4500)
    .setFooter({ text: "Flares expire after 5 minutes. Use Leave to remove yourself." })
    .setTimestamp();
}

export function buildFlareButtons(flareId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join_flare_${flareId}`)
      .setLabel("Join Queue")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`leave_flare_${flareId}`)
      .setLabel("Leave Queue")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`start_flare_${flareId}`)
      .setLabel("Start Quest")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`close_flare_${flareId}`)
      .setLabel("Close Flare")
      .setStyle(ButtonStyle.Danger),
  );
}

export default {
  async autocomplete(interaction) {
    await handleMyCrownedMonsterAutocomplete(interaction);
  },
  async execute(interaction) {
    const userId = interaction.user.id;
    const monsterName = interaction.options.getString("monster")?.toLowerCase().trim();
    const sessionIdOverride = interaction.options.getString("session_id");

    const monster = await resolveMonsterName(monsterName);
    if (!monster) {
      return interaction.reply(
        ephemeralStatus({
          title: "Monster Not Found",
          description: `No monster matched **${monsterName}**. Try selecting one from autocomplete.`,
          tone: "warning",
        })
      );
    }

    const crownsRes = await db.execute({
      sql: "SELECT id, type, tempered, strength_rating FROM crowns WHERE user_id = ? AND monster_id = ? ORDER BY tempered DESC, strength_rating DESC",
      args: [userId, monster.id],
    });

    if (crownsRes.rows.length === 0) {
      return interaction.reply(
        ephemeralStatus({
          title: "No Crown Data",
          description: `You do not have crowns logged for **${monster.name}** yet. Use \`/crown add\` first.`,
          tone: "warning",
        })
      );
    }

    const userRes = await db.execute({ sql: "SELECT lobby_id FROM users WHERE id = ?", args: [userId] });
    const sessionId = sessionIdOverride || userRes.rows[0]?.lobby_id;

    if (!sessionId) {
      return interaction.reply(
        ephemeralStatus({
          title: "Missing Lobby ID",
          description: "Set your Lobby ID with `/profile settings` first, or pass `session_id` on this command.",
          tone: "warning",
        })
      );
    }

    await db.execute({ sql: "DELETE FROM active_flares WHERE host_id = ?", args: [userId] });

    const bestCrown = crownsRes.rows[0];
    const flareRes = await db.execute({
      sql: "INSERT INTO active_flares (host_id, monster_id, type, tempered, strength_rating, session_id) VALUES (?, ?, ?, ?, ?, ?)",
      args: [userId, monster.id, bestCrown.type, bestCrown.tempered, bestCrown.strength_rating, sessionId],
    });
    const flareId = Number(flareRes.lastInsertRowid);

    const displayName = formatMonsterName(monster.name, bestCrown.tempered);
    const typeLabel = bestCrown.type === 'small' ? "Small Crown" : "Large Crown";
    const typeEmoji = bestCrown.type === 'small' ? E.smallCrown : E.largeCrown;

    const embed = buildFlareEmbed({
      displayName, monsterEmoji: monster.emoji, typeEmoji, typeLabel,
      strengthRating: bestCrown.strength_rating,
      hostUsername: interaction.user.username,
      sessionId,
      members: [],
    });

    const row = buildFlareButtons(flareId);

    if (monster.image_name) {
      embed.setThumbnail(`${WEB_HUB_URL}/monsters/${monster.image_name}`);
    }

    await interaction.reply({ embeds: [embed], components: [row] });
    const msg = await interaction.fetchReply();

    await db.execute({
      sql: "UPDATE active_flares SET discord_message_id = ?, discord_channel_id = ? WHERE id = ?",
      args: [msg.id, msg.channelId, flareId],
    });

    await interaction.client.pusher.trigger("public-channel", "flare_updated", { type: 'fired' }).catch(() => { });
  },
};
