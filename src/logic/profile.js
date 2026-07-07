import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";
import { COLORS, applyBrandFooter } from "../responseEmbeds.js";

const PROFILE_COLOR = COLORS.brand;
const WEB_BASE_URL = process.env.WEB_HUB_URL || "https://crownguild.com";
const PROFILE_SECTIONS = ["overview", "crowns", "wishlist", "collection"];
const SECTION_LABELS = {
  overview: "Overview",
  crowns: "Crowns",
  wishlist: "Wishlist",
  collection: "Collection",
};
const SECTION_EMOJIS = {
  overview: E.expeditionBoard,
  crowns: E.smallCrown,
  wishlist: E.notesCheckmark,
  collection: E.completedObj,
};
const PAGE_SIZE = 8;

const MASTERY_RANKS = [
  { rank: 1, title: "Fledgling", minPoints: 0 },
  { rank: 2, title: "Scout", minPoints: 100 },
  { rank: 3, title: "Tracker", minPoints: 300 },
  { rank: 4, title: "Hunter", minPoints: 750 },
  { rank: 5, title: "Veteran", minPoints: 1500 },
  { rank: 6, title: "Expert", minPoints: 3000 },
  { rank: 7, title: "Master", minPoints: 5000 },
  { rank: 8, title: "Legend", minPoints: 8000 },
];

let schemaPromise;

function numberValue(value) {
  return Number(value || 0);
}

function formatTypeLabel(type) {
  if (type === "both") return `${E.smallCrown} Small + ${E.largeCrown} Large`;
  if (type === "small") return `${E.smallCrown} Small`;
  if (type === "large") return `${E.largeCrown} Large`;
  return "Unknown";
}

function buildShareMonstersFromCrowns(crowns) {
  const list = Array.isArray(crowns) ? crowns : [];
  const groupedByMonster = new Map();
  const linkedMonsters = new Set();
  const pairMap = new Map();

  list.forEach((crown) => {
    if (!crown?.pair_id) return;

    const pairId = String(crown.pair_id);
    if (!pairMap.has(pairId)) pairMap.set(pairId, []);
    pairMap.get(pairId).push(crown);
  });

  for (const pair of pairMap.values()) {
    const pairMonsters = new Map();

    pair.forEach((crown) => {
      const name = String(crown?.name || "").trim();
      if (!name) return;

      const key = `${name}||${Number(crown?.tempered ? 1 : 0)}`;
      if (!pairMonsters.has(key)) {
        pairMonsters.set(key, { hasSmall: false, hasLarge: false });
      }

      const current = pairMonsters.get(key);
      if (crown?.type === "small") current.hasSmall = true;
      if (crown?.type === "large") current.hasLarge = true;
    });

    for (const [key, entry] of pairMonsters.entries()) {
      if (entry.hasSmall && entry.hasLarge) linkedMonsters.add(key);
    }
  }

  list.forEach((crown, index) => {
    const name = String(crown?.name || "").trim();
    if (!name) return;

    const key = `${name}||${Number(crown?.tempered ? 1 : 0)}`;
    if (!groupedByMonster.has(key)) {
      groupedByMonster.set(key, {
        name,
        emoji: crown?.emoji || E.hunt,
        tempered: Number(crown?.tempered ? 1 : 0),
        hasSmall: false,
        hasLarge: false,
        firstSeenSmall: Number.POSITIVE_INFINITY,
        firstSeenLarge: Number.POSITIVE_INFINITY,
        firstSeen: index,
      });
    }

    const current = groupedByMonster.get(key);
    if (crown?.type === "small") {
      current.hasSmall = true;
      current.firstSeenSmall = Math.min(current.firstSeenSmall, index);
    }
    if (crown?.type === "large") {
      current.hasLarge = true;
      current.firstSeenLarge = Math.min(current.firstSeenLarge, index);
    }
  });

  return Array.from(groupedByMonster.values())
    .flatMap((entry) => {
      const key = `${entry.name}||${entry.tempered}`;

      if (linkedMonsters.has(key)) {
        return [{ ...entry, category: "S+L", order: entry.firstSeen }];
      }

      const categories = [];
      if (entry.hasSmall) {
        categories.push({ ...entry, category: "Small", order: entry.firstSeenSmall });
      }
      if (entry.hasLarge) {
        categories.push({ ...entry, category: "Large", order: entry.firstSeenLarge });
      }
      return categories;
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order, firstSeenSmall, firstSeenLarge, firstSeen, ...entry }) => entry);
}

function buildCompactWishlistLine(wishlist) {
  if (!wishlist.length) return "";

  const grouped = { S: [], L: [], "S+L": [] };
  wishlist.forEach((item) => {
    const typeRaw = String(item?.type || "").toLowerCase();
    const bucket = typeRaw === "large" ? "L" : typeRaw === "small" ? "S" : "S+L";
    grouped[bucket].push(item?.emoji || E.hunt);
  });

  const parts = [];
  if (grouped.S.length) parts.push(`${E.smallCrown} ${grouped.S.slice(0, 40).join(" ")}`);
  if (grouped.L.length) parts.push(`${E.largeCrown} ${grouped.L.slice(0, 40).join(" ")}`);
  if (grouped["S+L"].length) parts.push(`S+L ${grouped["S+L"].slice(0, 40).join(" ")}`);

  return parts.length ? `${E.notesCheckmark} Wishlist: ${parts.join("  •  ")}` : "";
}

function buildProfileShareText(data, format = "compact") {
  const profileUrl = `${WEB_BASE_URL}/profile/${data.user.id}?share=${Date.now().toString(36)}`;
  const shareMonsters = buildShareMonstersFromCrowns(data.crowns);
  const slCount = shareMonsters.filter((m) => m.category === "S+L").length;
  const smallCount = shareMonsters.filter((m) => m.category === "Small").length;
  const largeCount = shareMonsters.filter((m) => m.category === "Large").length;

  if (format === "text") {
    const lines = [
      `**.${data.user.username} - Crown Collection**`,
      "",
      `Small + Large: ${slCount} monster${slCount !== 1 ? "s" : ""}`,
      `Small Crown: ${smallCount} monster${smallCount !== 1 ? "s" : ""}`,
      `Large Crown: ${largeCount} monster${largeCount !== 1 ? "s" : ""}`,
    ];

    if (data.wishlist.length > 0) {
      lines.push(`Wishlist: ${data.wishlist.length} monster${data.wishlist.length !== 1 ? "s" : ""}`);
    }

    lines.push("", `${E.linkParty} View full collection:`, profileUrl);
    return lines.join("\n");
  }

  const smallCrowns = [];
  const largeCrowns = [];
  const seenSmall = new Set();
  const seenLarge = new Set();

  for (const crown of data.crowns) {
    const key = `${crown.name}||${Number(crown.tempered ? 1 : 0)}||${Number(crown.strength_rating || 0)}`;
    if (crown.type === "small" && !seenSmall.has(key)) {
      seenSmall.add(key);
      smallCrowns.push(crown);
    } else if (crown.type === "large" && !seenLarge.has(key)) {
      seenLarge.add(key);
      largeCrowns.push(crown);
    }
  }

  function formatAvailLine(prefix, crowns) {
    const regular = crowns.filter((c) => !c.tempered).map((c) => c.emoji || E.hunt);
    const temperedByStrength = new Map();
    crowns
      .filter((c) => c.tempered)
      .forEach((crown) => {
        const strength = Number(crown.strength_rating || 0);
        const label = strength > 0 ? `${strength}★` : "Tempered";
        if (!temperedByStrength.has(label)) temperedByStrength.set(label, []);
        temperedByStrength.get(label).push(crown.emoji || E.hunt);
      });
    const parts = [...regular];
    for (const [label, emojis] of temperedByStrength.entries()) {
      parts.push(`(${label}: ${emojis.join(" ")})`);
    }
    if (!parts.length) return null;
    return `${prefix}: ${parts.join(" ")}`;
  }

  const sLine = formatAvailLine("S", smallCrowns);
  const lLine = formatAvailLine("L", largeCrowns);

  const pairMap = new Map();
  for (const crown of data.crowns) {
    if (!crown.pair_id) continue;
    const pairId = String(crown.pair_id);
    if (!pairMap.has(pairId)) pairMap.set(pairId, []);
    pairMap.get(pairId).push(crown);
  }

  const multiPairs = [];
  const seenPairLabels = new Set();
  for (const pair of pairMap.values()) {
    if (pair.length < 2) continue;
    const label = pair
      .slice(0, 2)
      .map((c) => `${c.type === "small" ? "S" : "L"} ${c.emoji || E.hunt}`)
      .join(" + ");
    if (!seenPairLabels.has(label)) {
      seenPairLabels.add(label);
      multiPairs.push(label);
    }
  }

  const lines = ["Available:"];
  if (sLine) lines.push(sLine);
  if (lLine) lines.push(lLine);

  if (multiPairs.length) {
    lines.push("Multi-Quest:");
    lines.push(multiPairs.join(" / "));
  }

  lines.push("", profileUrl);
  return lines.join("\n");
}

function mergeTypeRows(rows) {
  const merged = {};

  rows.forEach((row) => {
    const monsterId = row.monster_id;
    if (!merged[monsterId]) {
      merged[monsterId] = { ...row };
      return;
    }

    const existing = merged[monsterId].type;
    const incoming = row.type;

    if (existing === "both" || incoming === "both" || existing !== incoming) {
      merged[monsterId].type = "both";
    }
  });

  return Object.values(merged);
}

function getRankProgress(points) {
  let currentRank = MASTERY_RANKS[0];
  let nextRank = null;

  for (let index = 0; index < MASTERY_RANKS.length; index += 1) {
    if (points >= MASTERY_RANKS[index].minPoints) {
      currentRank = MASTERY_RANKS[index];
      nextRank = MASTERY_RANKS[index + 1] || null;
    }
  }

  if (!nextRank) {
    return { currentRank, nextRank: null, progress: 100 };
  }

  const range = nextRank.minPoints - currentRank.minPoints;
  const progress = range > 0 ? ((points - currentRank.minPoints) / range) * 100 : 100;

  return {
    currentRank,
    nextRank,
    progress: Math.max(0, Math.min(100, progress)),
  };
}

async function getProfileSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const [userColumnsRes, archiveTableRes] = await Promise.all([
        db.execute("PRAGMA table_info(users)"),
        db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'guild_archive'"),
      ]);

      const userColumns = new Set(userColumnsRes.rows.map((row) => row.name));

      return {
        hasRenown: userColumns.has("renown"),
        hasFeverUntil: userColumns.has("fever_until"),
        hasSharedCrowns: userColumns.has("shared_crowns"),
        hasMissionsCompleted: userColumns.has("missions_completed"),
        hasGuildArchive: archiveTableRes.rows.length > 0,
      };
    })();
  }

  return schemaPromise;
}

async function syncMissingDiscordUser(userId, client) {
  if (!client) return null;

  const discordUser = await client.users.fetch(userId).catch(() => null);
  if (!discordUser) return null;

  const username = discordUser.globalName || discordUser.username;
  const avatarUrl = discordUser.displayAvatarURL();

  await db.execute({
    sql: "UPDATE users SET username = ?, avatar_url = ? WHERE id = ?",
    args: [username, avatarUrl, userId],
  }).catch(() => {});

  return {
    username,
    avatar_url: avatarUrl,
  };
}

function buildSectionRow(userId, activeSection) {
  return new ActionRowBuilder().addComponents(
    PROFILE_SECTIONS.map((section) =>
      new ButtonBuilder()
        .setCustomId(`profileview_section_${section}_${userId}`)
        .setLabel(SECTION_LABELS[section])
        .setStyle(section === activeSection ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(section === activeSection)
    )
  );
}

function buildNavRow(userId, section, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`profileview_prev_${section}_${page}_${userId}`)
      .setLabel("← Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`profileview_next_${section}_${page}_${userId}`)
      .setLabel("Next →")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
}

function applyProfileHeader(embed, user, title) {
  embed
    .setColor(PROFILE_COLOR)
    .setTitle(title)
    .setAuthor({
      name: `${user.username}'s Hunter Card`,
      iconURL: user.avatar_url,
    })
    .setThumbnail(user.avatar_url)
    .setTimestamp();

  if (user.status_message) {
    embed.setDescription(`*"${user.status_message}"*`);
  }

  return embed;
}

function buildOverviewEmbed(data) {
  const { currentRank, nextRank, progress } = getRankProgress(data.masteryPoints);
  const snapshotLines = [
    `Tracked species: **${data.uniqueMonsters} / ${data.monsterCount}**`,
    `Completion: **${data.completion}%**`,
    `Wishlist targets: **${data.wishlist.length}**`,
    `Collection entries: **${data.collection.length}**`,
  ];

  if (data.activity.archiveCount > 0) {
    snapshotLines.push(`Guild archive: **${data.activity.archiveCount}**`);
  }

  if (data.user.renown > 0) {
    snapshotLines.push(`Renown: **${data.user.renown}**`);
  }

  const embed = applyProfileHeader(
    new EmbedBuilder(),
    data.user,
    `${E.expeditionBoard} Guild Registry Profile`
  ).addFields(
    {
      name: "Collection Mastery",
      value: `**${data.masteryPoints} MP**\nRank: **${currentRank.title}**\nProgress: **${Math.round(progress)}%**${nextRank ? `\nNext: **${nextRank.title}**` : ""}`,
      inline: true,
    },
    {
      name: "Crown Ledger",
      value: `Total: **${data.stats.total}**\n${E.smallCrown} ${data.stats.small}  •  ${E.largeCrown} ${data.stats.large}\n${E.tempered} Tempered: **${data.stats.tempered}**`,
      inline: true,
    },
    {
      name: "Registry Snapshot",
      value: snapshotLines.join("\n"),
      inline: true,
    },
    {
      name: `${E.lobby} Lobby Info`,
      value: data.user.lobby_id
        ? `ID: \`${data.user.lobby_id}\`\nPass: \`${data.user.quest_password || "None"}\``
        : "*No lobby info set*",
      inline: false,
    },
    {
      name: "Guild Activity",
      value: `Hosted hunts: **${data.activity.hosted}**\nJoined hunts: **${data.activity.joined}**\nShared crowns: **${data.user.sharedCrowns}**\nMissions completed: **${data.user.missionsCompleted}**`,
      inline: true,
    }
  );

  if (data.topAssist) {
    embed.addFields({
      name: "Top Assist",
      value: `${data.topAssist.emoji || E.hunt} **${data.topAssist.name}** (${data.topAssist.count} shared hunt${data.topAssist.count === 1 ? "" : "s"})`,
      inline: true,
    });
  }

  if (data.user.isFever) {
    embed.addFields({
      name: "Hunter Fever",
      value: "Active now. This hunter is currently on a hot streak.",
      inline: true,
    });
  }

  embed.setFooter({
    text: `Use the buttons below to browse ${data.user.username}'s profile sections`,
    iconURL: data.user.avatar_url,
  });

  return embed;
}

function buildCrownEntries(crowns) {
  return crowns.map((crown) => {
    const details = [formatTypeLabel(crown.type)];

    if (crown.tempered) details.push(`${E.tempered} Tempered`);
    if (crown.strength_rating) details.push(`${crown.strength_rating}★`);
    if (crown.quest) details.push(crown.quest);
    if (crown.remaining_uses !== null && crown.remaining_uses !== undefined) {
      details.push(`${crown.remaining_uses} uses`);
    }

    return `**${crown.emoji || E.hunt} ${crown.name}**\n> ${details.join("  •  ")}`;
  });
}

function buildWishlistEntries(wishlist) {
  return wishlist.map((item) => {
    const details = [formatTypeLabel(item.type)];
    if (item.tempered) details.push(`${E.tempered} Tempered`);
    return `**${item.emoji || E.hunt} ${item.monster_name}**\n> ${details.join("  •  ")}`;
  });
}

function buildCollectionEntries(collection) {
  return collection.map((item) => `**${item.emoji || E.hunt} ${item.monster_name}**\n> ${formatTypeLabel(item.type)}`);
}

function buildPagedSection(data, section, page, entries, title, footerSuffix, emptyText) {
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * PAGE_SIZE;
  const currentEntries = entries.slice(start, start + PAGE_SIZE);

  const embed = applyProfileHeader(
    new EmbedBuilder(),
    data.user,
    `${SECTION_EMOJIS[section]} ${title}`
  )
    .setDescription(currentEntries.join("\n\n") || emptyText)
    .setFooter({
      text: `Page ${safePage + 1} / ${totalPages}  •  ${entries.length} entries${footerSuffix ? `  •  ${footerSuffix}` : ""}`,
      iconURL: data.user.avatar_url,
    });

  const components = [buildSectionRow(data.user.id, section)];
  if (totalPages > 1) {
    components.push(buildNavRow(data.user.id, section, safePage, totalPages));
  }

  return { embeds: [embed], components };
}

export async function getProfileData(userId, client) {
  const schema = await getProfileSchema();
  const userColumns = [
    "id",
    "username",
    "avatar_url",
    "lobby_id",
    "quest_password",
    "status_message",
    "receive_dms",
  ];

  if (schema.hasSharedCrowns) userColumns.push("shared_crowns");
  if (schema.hasMissionsCompleted) userColumns.push("missions_completed");
  if (schema.hasRenown) userColumns.push("renown");
  if (schema.hasFeverUntil) userColumns.push("fever_until");

  const userRes = await db.execute({
    sql: `SELECT ${userColumns.join(", ")} FROM users WHERE id = ?`,
    args: [userId],
  });

  if (userRes.rows.length === 0) {
    return null;
  }

  const user = { ...userRes.rows[0] };

  if (!user.username || !user.avatar_url) {
    const synced = await syncMissingDiscordUser(userId, client);
    if (synced) {
      user.username = synced.username;
      user.avatar_url = synced.avatar_url;
    }
  }

  user.username = user.username || `Hunter ${String(userId).slice(0, 4)}`;
  user.avatar_url = user.avatar_url || "https://cdn.discordapp.com/embed/avatars/0.png";
  user.sharedCrowns = schema.hasSharedCrowns ? numberValue(user.shared_crowns) : 0;
  user.missionsCompleted = schema.hasMissionsCompleted ? numberValue(user.missions_completed) : 0;
  user.renown = schema.hasRenown ? numberValue(user.renown) : 0;
  user.isFever = schema.hasFeverUntil && user.fever_until ? new Date(user.fever_until) > new Date() : false;

  const [crownsRes, statsRes, activityRes, monsterCountRes, uniqueRes, topAssistRes, wishlistRes, collectionRes] = await Promise.all([
    db.execute({
      sql: `SELECT c.id, m.id as monster_id, m.name, m.emoji, c.type, c.tempered, c.strength_rating, c.quest,
                   c.pair_id, c.investigation_id, inv.remaining_uses
            FROM crowns c
            JOIN monsters m ON c.monster_id = m.id
            LEFT JOIN investigations inv ON c.investigation_id = inv.id
            WHERE c.user_id = ?
            ORDER BY c.id DESC`,
      args: [userId],
    }),
    db.execute({
      sql: `SELECT
              COUNT(*) as total,
              SUM(CASE WHEN type = 'small' THEN 1 ELSE 0 END) as small,
              SUM(CASE WHEN type = 'large' THEN 1 ELSE 0 END) as large,
              SUM(CASE WHEN tempered = 1 THEN 1 ELSE 0 END) as tempered
            FROM crowns WHERE user_id = ?`,
      args: [userId],
    }),
    db.execute({
      sql: `SELECT
              (SELECT COUNT(*) FROM completed_missions WHERE host_id = ?) as hosted,
              (SELECT COUNT(*) FROM completed_missions WHERE requester_id = ?) as joined,
              ${schema.hasGuildArchive ? "(SELECT COUNT(*) FROM guild_archive WHERE user_id = ?)" : "0"} as archive_count`,
      args: schema.hasGuildArchive ? [userId, userId, userId] : [userId, userId],
    }),
    db.execute({
      sql: "SELECT COUNT(*) as count FROM monsters",
      args: [],
    }),
    db.execute({
      sql: `SELECT COUNT(DISTINCT monster_id) as count FROM (
              SELECT monster_id FROM crowns WHERE user_id = ?
              UNION
              SELECT monster_id FROM completed_missions WHERE host_id = ?
              UNION
              SELECT monster_id FROM completed_missions WHERE requester_id = ?
            )`,
      args: [userId, userId, userId],
    }),
    db.execute({
      sql: `SELECT m.name, m.emoji, COUNT(*) as count
            FROM completed_missions cm
            JOIN monsters m ON cm.monster_id = m.id
            WHERE cm.host_id = ?
            GROUP BY cm.monster_id
            ORDER BY count DESC
            LIMIT 1`,
      args: [userId],
    }),
    db.execute({
      sql: `SELECT w.monster_id, w.type, w.tempered, m.name as monster_name, m.emoji
            FROM wishlist w
            JOIN monsters m ON w.monster_id = m.id
            WHERE w.user_id = ?
            ORDER BY m.name ASC`,
      args: [userId],
    }),
    db.execute({
      sql: `SELECT hc.monster_id, hc.type, m.name as monster_name, m.emoji
            FROM hunter_collection hc
            JOIN monsters m ON hc.monster_id = m.id
            WHERE hc.user_id = ?
            ORDER BY m.name ASC`,
      args: [userId],
    }),
  ]);

  const stats = statsRes.rows[0] || {};
  const activity = activityRes.rows[0] || {};
  const collection = mergeTypeRows(collectionRes.rows);
  const wishlist = mergeTypeRows(wishlistRes.rows);

  let masteryPoints = 0;
  collection.forEach((item) => {
    if (item.type === "small" || item.type === "large") masteryPoints += 10;
    if (item.type === "both") masteryPoints += 30;
  });
  masteryPoints += numberValue(activity.hosted) * 5;
  masteryPoints += numberValue(activity.joined) * 2;
  masteryPoints += user.renown * 15;
  masteryPoints += numberValue(activity.archive_count) * 25;

  const monsterCount = Math.max(1, numberValue(monsterCountRes.rows[0]?.count));
  const uniqueMonsters = numberValue(uniqueRes.rows[0]?.count);
  const completion = ((uniqueMonsters / monsterCount) * 100).toFixed(1);

  return {
    user,
    crowns: crownsRes.rows.map((row) => ({ ...row })),
    wishlist,
    collection,
    stats: {
      total: numberValue(stats.total),
      small: numberValue(stats.small),
      large: numberValue(stats.large),
      tempered: numberValue(stats.tempered),
    },
    activity: {
      hosted: numberValue(activity.hosted),
      joined: numberValue(activity.joined),
      archiveCount: numberValue(activity.archive_count),
    },
    completion,
    masteryPoints,
    monsterCount,
    uniqueMonsters,
    topAssist: topAssistRes.rows[0]
      ? {
          name: topAssistRes.rows[0].name,
          emoji: topAssistRes.rows[0].emoji,
          count: numberValue(topAssistRes.rows[0].count),
        }
      : null,
  };
}

export async function buildProfileMessage(userId, client, section = "overview", page = 0) {
  const data = await getProfileData(userId, client);
  if (!data) return null;

  if (section === "crowns") {
    return buildPagedSection(
      data,
      "crowns",
      page,
      buildCrownEntries(data.crowns),
      "Crown Ledger",
      `${data.stats.total} crowns recorded`,
      "*No crowns recorded yet.*"
    );
  }

  if (section === "wishlist") {
    return buildPagedSection(
      data,
      "wishlist",
      page,
      buildWishlistEntries(data.wishlist),
      "Wishlist Targets",
      `${data.wishlist.length} targets`,
      "*No wishlist targets yet.*"
    );
  }

  if (section === "collection") {
    return buildPagedSection(
      data,
      "collection",
      page,
      buildCollectionEntries(data.collection),
      "Collection Tracker",
      `${data.collection.length} entries  •  ${data.completion}% completion`,
      "*No collection entries yet.*"
    );
  }

  return {
    embeds: [buildOverviewEmbed(data)],
    components: [buildSectionRow(data.user.id, "overview")],
  };
}

export default {
  async execute(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const payload = await buildProfileMessage(targetUser.id, interaction.client, "overview", 0);

    if (!payload) {
      return interaction.reply({
        content: "Hunter not found in the registry.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply({
      ...payload,
      flags: MessageFlags.Ephemeral,
    });
  },
  async executeShare(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const format = interaction.options.getString("format") || "compact";
    const data = await getProfileData(targetUser.id, interaction.client);

    if (!data) {
      return interaction.reply({
        content: "Hunter not found in the registry.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const text = buildProfileShareText(data, format);

    if (text.length > 2000) {
      return interaction.reply({
        content: "Share text is too long for one message. Try `/profile share format:text` for a shorter summary.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply({ content: text });
  },
};
