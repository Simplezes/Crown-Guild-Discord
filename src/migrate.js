import db from "./database.js";

async function migrate() {
  console.log("Running migration: investigations table + investigation_id on crowns...");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS investigations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        TEXT    NOT NULL,
      monster_id     INTEGER NOT NULL,
      remaining_uses INTEGER,
      FOREIGN KEY (user_id)    REFERENCES users(id),
      FOREIGN KEY (monster_id) REFERENCES monsters(id)
    )
  `);
  console.log("  ✓ investigations table ready");

  try {
    await db.execute(`ALTER TABLE crowns ADD COLUMN investigation_id INTEGER REFERENCES investigations(id) ON DELETE SET NULL`);
    console.log("  ✓ crowns.investigation_id column added");
  } catch {
    console.log("  · crowns.investigation_id already exists – skipping");
  }

  const legacyRes = await db.execute(`
    SELECT id, user_id, monster_id, remaining_uses
    FROM crowns
    WHERE quest = 'Investigation Quests'
      AND remaining_uses IS NOT NULL
      AND investigation_id IS NULL
  `);

  console.log(`  Migrating ${legacyRes.rows.length} existing investigation crown(s)...`);

  for (const crown of legacyRes.rows) {
    const invRes = await db.execute({
      sql: `INSERT INTO investigations (user_id, monster_id, remaining_uses) VALUES (?, ?, ?)`,
      args: [crown.user_id, crown.monster_id, crown.remaining_uses],
    });

    const investigationId = invRes.lastInsertRowid;

    await db.execute({
      sql: `UPDATE crowns SET investigation_id = ?, remaining_uses = NULL WHERE id = ?`,
      args: [investigationId, crown.id],
    });

    console.log(`    Crown #${crown.id} → Investigation #${investigationId}`);
  }

  console.log("Migration complete.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
