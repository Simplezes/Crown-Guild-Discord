import db from "./database.js";
import fs from "fs";
import path from "path";
import { E } from "./emojis.js";

const MONSTERS_PATH = path.join(process.cwd(), "src/database/monsters.json");

export function getMonstersFromJson() {
  try {
    const data = JSON.parse(fs.readFileSync(MONSTERS_PATH, "utf8"));
    return data.monsters || [];
  } catch (err) {
    console.error("Error reading monsters.json:", err);
    return [];
  }
}

function nameToEmojiKey(name) {
  return name
    .toLowerCase()
    .split(/[\s-]+/)
    .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

export async function handleMonsterAutocomplete(interaction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const monsters = getMonstersFromJson();

  const choices = monsters
    .filter(m => m.name.toLowerCase().includes(focusedValue))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25)
    .map(m => ({
      name: m.name,
      value: m.name
    }));

  await interaction.respond(choices);
}

export async function handleCrownedMonsterAutocomplete(interaction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  try {
    const res = await db.execute({
      sql: `
        SELECT DISTINCT m.name
        FROM crowns c
        JOIN monsters m ON c.monster_id = m.id
        WHERE m.name LIKE ? AND m.name NOT LIKE 'tempered %'
        ORDER BY m.name ASC
        LIMIT 25
      `,
      args: [`%${focusedValue}%`],
    });

    const choices = res.rows.map(row => {
      const displayName = row.name.charAt(0).toUpperCase() + row.name.slice(1);
      return {
        name: displayName,
        value: row.name,
      };
    });

    await interaction.respond(choices);
  } catch (error) {
    console.error("[Autocomplete] Error in crowned autocomplete:", error);
    await interaction.respond([]);
  }
}

export async function handleMyCrownedMonsterAutocomplete(interaction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const userId = interaction.user.id;

  try {
    const res = await db.execute({
      sql: `
        SELECT DISTINCT m.name
        FROM crowns c
        JOIN monsters m ON c.monster_id = m.id
        WHERE c.user_id = ? AND m.name LIKE ?
        ORDER BY m.name ASC
        LIMIT 25
      `,
      args: [userId, `%${focusedValue}%`],
    });

    const choices = res.rows.map(row => {
      const displayName = row.name.charAt(0).toUpperCase() + row.name.slice(1);
      return {
        name: displayName,
        value: row.name,
      };
    });

    await interaction.respond(choices);
  } catch (error) {
    console.error("[Autocomplete] Error in my crowned autocomplete:", error);
    await interaction.respond([]);
  }
}

export async function ensureMonsterInDb(monsterName) {
  let normalized = monsterName.toLowerCase().trim();
  if (normalized.startsWith("tempered ")) {
    normalized = normalized.replace(/^tempered /, "").trim();
  }

  const monsters = getMonstersFromJson();
  const monsterData = monsters.find(m => m.name.toLowerCase() === normalized);

  if (!monsterData) return null;

  const emojiKey = nameToEmojiKey(monsterData.name);
  const emoji = E[emojiKey] || null;

  const existing = await db.execute({
    sql: "SELECT id, emoji FROM monsters WHERE LOWER(name) = ?",
    args: [monsterData.name.toLowerCase()]
  });

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (emoji && row.emoji !== emoji) {
      await db.execute({
        sql: "UPDATE monsters SET emoji = ? WHERE id = ?",
        args: [emoji, row.id]
      });
    }
    return row.id;
  }

  const imageName = monsterData.games?.[0]?.image || null;
  const res = await db.execute({
    sql: "INSERT INTO monsters (name, is_large, image_name, emoji) VALUES (?, ?, ?, ?)",
    args: [monsterData.name, monsterData.isLarge ? 1 : 0, imageName, emoji]
  });

  return Number(res.lastInsertRowid);
}

export async function resolveMonsterName(input) {
  if (!input) return null;
  let normalized = input.toLowerCase().trim();
  if (normalized.startsWith("tempered ")) {
    normalized = normalized.replace(/^tempered /, "").trim();
  }

  const monsters = getMonstersFromJson();

  let monster = monsters.find(m => m.name.toLowerCase() === normalized);
  if (monster) {
    const dbId = await ensureMonsterInDb(monster.name);
    const emojiKey = nameToEmojiKey(monster.name);
    return {
      id: dbId,
      name: monster.name,
      image_name: monster.games?.[0]?.image,
      is_large: monster.isLarge,
      emoji: E[emojiKey] || "🐉"
    };
  }

  monster = monsters.find(m => m.name.toLowerCase().includes(normalized));
  if (monster) {
    const dbId = await ensureMonsterInDb(monster.name);
    const emojiKey = nameToEmojiKey(monster.name);
    return {
      id: dbId,
      name: monster.name,
      image_name: monster.games?.[0]?.image,
      is_large: monster.isLarge,
      emoji: E[emojiKey] || "🐉"
    };
  }

  let best = null;
  let bestScore = Infinity;

  for (const m of monsters) {
    const score = levenshtein(normalized, m.name.toLowerCase());
    if (score < bestScore && score <= 3) {
      bestScore = score;
      best = m;
    }
  }

  if (best) {
    const dbId = await ensureMonsterInDb(best.name);
    const emojiKey = nameToEmojiKey(best.name);
    return {
      id: dbId,
      name: best.name,
      image_name: best.games?.[0]?.image,
      is_large: best.isLarge,
      emoji: E[emojiKey] || "🐉"
    };
  }

  return null;
}


function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

