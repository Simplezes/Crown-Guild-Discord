import db from "./database.js";

async function run() {
  try {
    await db.execute("ALTER TABLE crowns ADD COLUMN pair_id TEXT");
    console.log("✅ Added pair_id column to crowns table.");
  } catch (err) {
    if (err.message?.includes("duplicate column name")) {
      console.log("ℹ️  pair_id column already exists — skipping.");
    } else {
      throw err;
    }
  }
  process.exit(0);
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
