import { EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { getMonstersFromJson, handleMonsterAutocomplete, resolveMonsterName } from "../utils.js";
import { E } from "../emojis.js";
import { ephemeralStatus, COLORS, applyBrandFooter } from "../responseEmbeds.js";

function buildWishlistTypeLabel(type) {
  if (type === "both") return `${E.smallCrown} ${E.largeCrown}`;
  return type === "small" ? E.smallCrown : E.largeCrown;
}

function formatWishlistRow(row) {
  const tempLabel = row.tempered ? "Tempered " : "";
  return `${row.emoji} **${row.monster_name}** (${tempLabel}${buildWishlistTypeLabel(row.type)})`;
}

export async function executeCompare(interaction) {
  const userA = interaction.options.getUser("hunter_a");
  const userB = interaction.options.getUser("hunter_b");

  const [dataA, dataB] = await Promise.all([
    getHunterCompareData(userA.id),
    getHunterCompareData(userB.id),
  ]);

  const mapA = new Map(dataA.wishlist.map((row) => [row.monster_id, row]));
  const mapB = new Map(dataB.wishlist.map((row) => [row.monster_id, row]));

  const both = dataA.wishlist.filter((row) => mapB.has(row.monster_id));
  const onlyA = dataA.wishlist.filter((row) => !mapB.has(row.monster_id));
  const onlyB = dataB.wishlist.filter((row) => !mapA.has(row.monster_id));

  const sharedOwnedCount = [...dataA.ownedSpecies].filter((monsterId) => dataB.ownedSpecies.has(monsterId)).length;
  const onlyOwnedA = [...dataA.ownedSpecies].filter((monsterId) => !dataB.ownedSpecies.has(monsterId)).length;
  const onlyOwnedB = [...dataB.ownedSpecies].filter((monsterId) => !dataA.ownedSpecies.has(monsterId)).length;
  const totalTrackedWishlist = both.length + onlyA.length + onlyB.length;
  const sharedMatch = totalTrackedWishlist > 0 ? Math.round((both.length / totalTrackedWishlist) * 100) : 0;

  const embed = new EmbedBuilder()
    .setTitle(`${E.squadCounter} Hunter Comparison`)
    .setColor(COLORS.legendary)
    .setTimestamp();
  applyBrandFooter(embed, `${userA.username} vs ${userB.username}`);

  embed.addFields(
    {
      name: `${userA.username}`,
      value: [
        `Crowns: **${dataA.stats.total}**`,
        `Small / Large: **${dataA.stats.small}** / **${dataA.stats.large}**`,
        `Tempered: **${dataA.stats.tempered}**`,
        `Species: **${dataA.stats.species}**`,
        `Completion: **${dataA.stats.completion}%**`,
      ].join("\n"),
      inline: true,
    },
    {
      name: `Shared Intel`,
      value: [
        `Shared wishlist targets: **${both.length}**`,
        `Shared crown species: **${sharedOwnedCount}**`,
        `Shared match: **${sharedMatch}%**`,
      ].join("\n"),
      inline: true,
    },
    {
      name: `${userB.username}`,
      value: [
        `Crowns: **${dataB.stats.total}**`,
        `Small / Large: **${dataB.stats.small}** / **${dataB.stats.large}**`,
        `Tempered: **${dataB.stats.tempered}**`,
        `Species: **${dataB.stats.species}**`,
        `Completion: **${dataB.stats.completion}%**`,
      ].join("\n"),
      inline: true,
    },
    {
      name: `Collection Spread`,
      value: `${userA.username} only: **${onlyOwnedA}**\n${userB.username} only: **${onlyOwnedB}**\nCombined species: **${sharedOwnedCount + onlyOwnedA + onlyOwnedB}**`,
      inline: false,
    }
  );

  if (both.length > 0) {
    embed.addFields({
      name: `${E.linkParty} Shared Hunt Board (${both.length})`,
      value: both.slice(0, 10).map(formatWishlistRow).join("\n").slice(0, 1024),
    });
  }

  if (onlyA.length > 0) {
    embed.addFields({
      name: `${E.hunt} Only ${userA.username} Seeks (${onlyA.length})`,
      value: onlyA.slice(0, 8).map(formatWishlistRow).join("\n").slice(0, 1024),
    });
  }

  if (onlyB.length > 0) {
    embed.addFields({
      name: `${E.hunt} Only ${userB.username} Seeks (${onlyB.length})`,
      value: onlyB.slice(0, 8).map(formatWishlistRow).join("\n").slice(0, 1024),
    });
  }

  if (both.length === 0 && onlyA.length === 0 && onlyB.length === 0) {
    embed.setDescription("Neither hunter has wishlist targets yet, but their crown stats above are still compared.");
  } else if (both.length === 0) {
    embed.setDescription("No shared wishlist targets yet. Their collection and crown progress are compared above.");
  }

  return interaction.reply({ embeds: [embed] });
}

async function getHunterCompareData(userId) {
  const [statsRes, ownedRes, wishlistRes] = await Promise.all([
    db.execute({
      sql: `SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN type = 'small' THEN 1 ELSE 0 END) as small,
              SUM(CASE WHEN type = 'large' THEN 1 ELSE 0 END) as large,
              SUM(CASE WHEN tempered = 1 THEN 1 ELSE 0 END) as tempered,
              COUNT(DISTINCT monster_id) as species
            FROM crowns WHERE user_id = ?`,
      args: [userId]
    }),
    db.execute({
      sql: `SELECT DISTINCT monster_id FROM crowns WHERE user_id = ?`,
      args: [userId]
    }),
    db.execute({
      sql: `SELECT w.monster_id, w.type, w.tempered, m.name as monster_name, m.emoji
            FROM wishlist w
            JOIN monsters m ON w.monster_id = m.id
            WHERE w.user_id = ?
            ORDER BY m.name ASC`,
      args: [userId]
    })
  ]);

  const monsterCount = getMonstersFromJson().length || 1;
  const stats = statsRes.rows[0] || {};
  const species = Number(stats.species || 0);

  return {
    stats: {
      total: Number(stats.total || 0),
      small: Number(stats.small || 0),
      large: Number(stats.large || 0),
      tempered: Number(stats.tempered || 0),
      species,
      completion: Math.round((species / monsterCount) * 100)
    },
    ownedSpecies: new Set(ownedRes.rows.map((row) => Number(row.monster_id))),
    wishlist: wishlistRes.rows.map((row) => ({ ...row }))
  };
}

export default {
  async autocomplete(interaction) {
    await handleMonsterAutocomplete(interaction);
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "add") {
      const monsterName = interaction.options.getString("monster")?.toLowerCase().trim();
      const type = interaction.options.getString("type");
      const tempered = interaction.options.getBoolean("tempered") ? 1 : 0;

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

      await db.execute({
        sql: "INSERT OR REPLACE INTO wishlist (user_id, monster_id, type, tempered) VALUES (?, ?, ?, ?)",
        args: [userId, monster.id, type, tempered]
      });

      const typeLabel = type === 'both' ? "Small & Large Crowns" : (type === 'small' ? "Small Crown" : "Large Crown");
      const tempLabel = tempered ? "Tempered " : "";

      return interaction.reply(
        ephemeralStatus({
          title: "Wishlist Updated",
          description: `Added **${tempLabel}${monster.name}** (${typeLabel}) to your wishlist.`,
          tone: "success",
        })
      );

    } else if (sub === "remove") {
      const monsterName = interaction.options.getString("monster")?.toLowerCase().trim();
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

      await db.execute({
        sql: "DELETE FROM wishlist WHERE user_id = ? AND monster_id = ?",
        args: [userId, monster.id]
      });

      return interaction.reply(
        ephemeralStatus({
          title: "Wishlist Updated",
          description: `Removed **${monster.name}** from your wishlist.`,
          tone: "info",
        })
      );

    } else if (sub === "view") {
      const res = await db.execute({
        sql: `
          SELECT w.*, m.name as monster_name, m.emoji 
          FROM wishlist w 
          JOIN monsters m ON w.monster_id = m.id 
          WHERE w.user_id = ?
          ORDER BY m.name ASC
        `,
        args: [userId]
      });

      if (res.rows.length === 0) {
        return interaction.reply(
          ephemeralStatus({
            title: "Wishlist Empty",
            description: "Your wishlist is currently empty.",
            tone: "neutral",
          })
        );
      }

      const list = res.rows.map(row => {
        const typeLabel = row.type === 'both' ? "Both" : (row.type === 'small' ? "Small" : "Large");
        const tempLabel = row.tempered ? "Tempered " : "";
        return `> ${row.emoji} **${row.monster_name}** (${tempLabel}${typeLabel})`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`${E.notesCheckmark} Your Crown Wishlist`)
        .setDescription(list.join("\n"))
        .setColor(COLORS.legendary)
        .setTimestamp();
      applyBrandFooter(embed);

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
