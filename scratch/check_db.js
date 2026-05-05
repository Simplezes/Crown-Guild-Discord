import { createClient } from "@libsql/client";
import "dotenv/config";

const db = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function check() {
  const tables = await db.execute("SELECT sql FROM sqlite_master WHERE type='table'");
  for (const row of tables.rows) {
    console.log("---");
    console.log(row.sql);
  }
}

check().catch(console.error);
