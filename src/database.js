import { createClient } from "@libsql/client";
import "dotenv/config";

const db = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function setupDatabase() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      avatar_url TEXT,
      shared_crowns INTEGER DEFAULT 0,
      missions_completed INTEGER DEFAULT 0,
      lobby_id TEXT,
      quest_password TEXT,
      status_message TEXT,
      receive_dms INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS active_missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id TEXT,
      requester_id TEXT,
      monster_id INTEGER,
      type TEXT,
      tempered INTEGER,
      strength_rating INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (host_id) REFERENCES users(id),
      FOREIGN KEY (requester_id) REFERENCES users(id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )`,
    `CREATE TABLE IF NOT EXISTS completed_missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id TEXT,
      requester_id TEXT,
      monster_id INTEGER,
      type TEXT,
      tempered INTEGER,
      strength_rating INTEGER,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (host_id) REFERENCES users(id),
      FOREIGN KEY (requester_id) REFERENCES users(id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )`,
    `CREATE TABLE IF NOT EXISTS monsters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      is_large INTEGER DEFAULT 1,
      image_name TEXT,
      emoji TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS investigations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        TEXT    NOT NULL,
      monster_id     INTEGER NOT NULL,
      remaining_uses INTEGER,
      FOREIGN KEY (user_id)    REFERENCES users(id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )`,
    `CREATE TABLE IF NOT EXISTS crowns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      monster_id INTEGER,
      type TEXT CHECK(type IN ('small', 'large')),
      tempered INTEGER DEFAULT 0,
      strength_rating INTEGER DEFAULT 1,
      quest TEXT,
      remaining_uses INTEGER,
      investigation_id INTEGER REFERENCES investigations(id) ON DELETE SET NULL,
      pair_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )`,
    `CREATE TABLE IF NOT EXISTS web_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      host_id TEXT,
      recipient_id TEXT,
      type TEXT,
      monster_id INTEGER,
      crown_id INTEGER,
      status TEXT DEFAULT 'pending',
      discord_message_id TEXT,
      discord_channel_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (host_id) REFERENCES users(id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id),
      FOREIGN KEY (crown_id) REFERENCES crowns(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      monster_id INTEGER,
      type TEXT CHECK(type IN ('small', 'large', 'both')),
      tempered INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )`,
    `CREATE TABLE IF NOT EXISTS active_flares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id TEXT,
      monster_id INTEGER,
      type TEXT,
      tempered INTEGER,
      strength_rating INTEGER,
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (host_id) REFERENCES users(id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )`,
    `CREATE TABLE IF NOT EXISTS flare_queue (
      flare_id INTEGER,
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (flare_id, user_id),
      FOREIGN KEY (flare_id) REFERENCES active_flares(id) ON DELETE CASCADE
    )`
  ], "write");

  await db.execute(`ALTER TABLE active_missions ADD COLUMN group_id TEXT`).catch(() => {});
  await db.execute(`ALTER TABLE active_missions ADD COLUMN hunter_confirmed INTEGER DEFAULT 0`).catch(() => {});
  await db.execute(`ALTER TABLE active_missions ADD COLUMN expiry_notified INTEGER DEFAULT 0`).catch(() => {});

  console.log("Database tables initialized.");
}

export default db;
