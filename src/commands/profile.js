import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";
import { getMonstersFromJson } from "../utils.js";

function getHunterRank(hosted, joined) {
  const total = hosted + joined;
  if (total === 0) return "Fledgling";

  if (hosted >= joined * 2) {
    if (hosted >= 50) return "Guild Patron";
    if (hosted >= 20) return "Crown Broker";
    if (hosted >= 5) return "Expedition Leader";
    return "Host";
  } else if (joined >= hosted * 2) {
    if (joined >= 50) return "Crown Assassin";
    if (joined >= 20) return "Elite Mercenary";
    if (joined >= 5) return "Crown Seeker";
    return "Hunter";
  } else {
    if (total >= 100) return "Guild Legend";
    if (total >= 40) return "Veteran Hunter";
    if (total >= 10) return "Seasoned Hunter";
    return "Hunter";
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your hunter profile and stats")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user whose profile you want to view")
        .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser("user") || interaction.user;

    await targetUser.fetch().catch(() => { });

    await db.execute({
      sql: "INSERT OR IGNORE INTO users(id) VALUES (?)",
      args: [targetUser.id]
    });

    const userRes = await db.execute({
      sql: "SELECT shared_crowns, missions_completed, lobby_id, quest_password FROM users WHERE id = ?",
      args: [targetUser.id],
    });
    const userData = userRes.rows[0] || { shared_crowns: 0, missions_completed: 0 };

    const crownsRes = await db.execute({
      sql: `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN type = 'small' THEN 1 ELSE 0 END) as small_count,
          SUM(CASE WHEN type = 'large' THEN 1 ELSE 0 END) as large_count,
          SUM(CASE WHEN tempered = 1 THEN 1 ELSE 0 END) as tempered_count
        FROM crowns 
        WHERE user_id = ?
      `,
      args: [targetUser.id],
    });
    const crownsData = crownsRes.rows[0];

    const uniqueRes = await db.execute({
      sql: `SELECT COUNT(DISTINCT monster_id) as c FROM (
              SELECT monster_id FROM crowns WHERE user_id = ?
              UNION
              SELECT monster_id FROM completed_missions WHERE host_id = ?
              UNION
              SELECT monster_id FROM completed_missions WHERE requester_id = ?
            )`,
      args: [targetUser.id, targetUser.id, targetUser.id]
    });
    const uniqueMonsters = uniqueRes.rows[0]?.c || 0;

    const userRank = getHunterRank(userData.shared_crowns || 0, userData.missions_completed || 0);

    const allMonsters = getMonstersFromJson();
    const totalMonsters = Math.max(allMonsters.length, 1);
    const completionPercent = ((uniqueMonsters / totalMonsters) * 100).toFixed(1);
    const sharedRes = await db.execute({
      sql: `
        SELECT m.name, m.emoji, COUNT(*) as count 
        FROM completed_missions cm
        JOIN monsters m ON cm.monster_id = m.id
        WHERE cm.host_id = ?
        GROUP BY cm.monster_id
        ORDER BY count DESC
        LIMIT 1
      `,
      args: [targetUser.id],
    });

    let mostSharedString = "*No crowns shared yet*";
    if (sharedRes.rows.length > 0) {
      const topShared = sharedRes.rows[0];
      const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      const name = topShared.name.split(' ').map(capitalize).join(' ');
      mostSharedString = `> ${topShared.emoji} **${name}**\n> Shared **${topShared.count}** ${topShared.count === 1 ? "time" : "times"}`;
    }

    const filled = Math.round((uniqueMonsters / totalMonsters) * 10);
    const empty = 10 - filled;
    const progressBar = `${"█".repeat(filled)}${"░".repeat(empty)} ${completionPercent}%`;

    const lobbyLine = userData.lobby_id
      ? `> <:MHWildsLobby_Icon:1500270248647987300> **Lobby:** \`${userData.lobby_id}\`${userData.quest_password ? `  •  **Pass:** \`${userData.quest_password}\`` : ""}`
      : `> <:MHWildsLobby_Icon:1500270248647987300> *No lobby set - use \`/settings\` to add one.*`;

    const embed = new EmbedBuilder()
      .setAuthor({ name: `Crown Guild  •  Hunter Registry`, iconURL: "attachment://icon.png" })
      .setTitle(`${targetUser.username}`)
      .setColor(0xC4982A)
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .setDescription(
        [
          `${E.expeditionBoard} **Hunter Card**`,
          `> **Rank:** ${userRank}`,
          ``,
          lobbyLine,
        ].join("\n")
      )
      .addFields(
        {
          name: "👑  Crown Collection",
          value: [
            `> ${E.smallCrown} Small      **${crownsData.small_count || 0}**`,
            `> ${E.largeCrown} Large       **${crownsData.large_count || 0}**`,
            `> ${E.tempered} Tempered  **${crownsData.tempered_count || 0}**`,
            `> `,
            `> **Total  -  ${crownsData.total}**`,
          ].join("\n"),
          inline: true,
        },
        {
          name: `${E.squadCounter}  Guild Activity`,
          value: [
            `> ${E.questMembers} Hosted    **${userData.shared_crowns}**`,
            `> ${E.completedObj} Joined     **${userData.missions_completed}**`,
            `> `,
            `> ${E.notesCheckmark} Field Guide Completion`,
            `> \`${progressBar}\``,
          ].join("\n"),
          inline: true,
        },
        {
          name: `${E.linkParty}  Top Assist`,
          value: mostSharedString,
          inline: false,
        }
      )
      .setImage(targetUser.bannerURL({ size: 1024 }))
      .setFooter({ text: `Crown Guild Official Registry  •  ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`, iconURL: "attachment://icon.png" });

    const path = await import("path");
    const fs = await import("fs");
    const iconPath = path.join(process.cwd(), "icon.png");
    const files = [];

    if (fs.existsSync(iconPath)) {
      files.push({ attachment: iconPath, name: "icon.png" });
    }

    await interaction.editReply({ embeds: [embed], files });
  },
};
