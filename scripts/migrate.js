import { createClient } from "@libsql/client";
import "dotenv/config";

const db = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function migrate() {
  console.log("🚀 Starting Database Migration...");

  const tables = [
    `CREATE TABLE IF NOT EXISTS investigations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        TEXT    NOT NULL,
      monster_id     INTEGER NOT NULL,
      remaining_uses INTEGER,
      FOREIGN KEY (user_id)    REFERENCES users(id),
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
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )`
  ];

  for (const sql of tables) {
    try {
      await db.execute(sql);
      console.log(`✅ Table checked/created.`);
    } catch (e) {
      console.error(`❌ Table error:`, e.message);
    }
  }

  const columnUpdates = [
    { table: 'users', column: 'lobby_id', type: 'TEXT' },
    { table: 'users', column: 'quest_password', type: 'TEXT' },
    { table: 'users', column: 'status_message', type: 'TEXT' },
    { table: 'users', column: 'receive_dms', type: 'INTEGER DEFAULT 1' },
    { table: 'users', column: 'main_crown_server_id', type: 'TEXT' },
    { table: 'users', column: 'shared_crowns', type: 'INTEGER DEFAULT 0' },
    { table: 'users', column: 'missions_completed', type: 'INTEGER DEFAULT 0' },
    { table: 'crowns', column: 'tempered', type: 'INTEGER DEFAULT 0' },
    { table: 'crowns', column: 'strength_rating', type: 'INTEGER DEFAULT 1' },
    { table: 'crowns', column: 'quest', type: 'TEXT' },
    { table: 'crowns', column: 'remaining_uses', type: 'INTEGER' },
    { table: 'crowns', column: 'investigation_id', type: 'INTEGER' },
    { table: 'crowns', column: 'pair_id', type: 'TEXT' },
    { table: 'web_notifications', column: 'crown_id', type: 'INTEGER' }
  ];

  for (const update of columnUpdates) {
    try {
      await db.execute(`ALTER TABLE ${update.table} ADD COLUMN ${update.column} ${update.type}`);
      console.log(`✅ Added column ${update.column} to ${update.table}`);
    } catch (e) {
      if (e.message.includes("duplicate column name") || e.message.includes("already exists")) {
      } else {
        console.error(`❌ Column error (${update.table}.${update.column}):`, e.message);
      }
    }
  }

  console.log("✨ Migration Finished!");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed", err);
  process.exit(1);
});
