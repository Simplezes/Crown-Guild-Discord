import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seed() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "database/monsters.json"), "utf8"));
  const monsters = data.monsters;

  console.log(`Seeding ${monsters.length} monsters...`);

  for (const monster of monsters) {
    const imageName = monster.games && monster.games.length > 0 ? monster.games[0].image : null;
    await db.execute({
      sql: `
        INSERT INTO monsters (name, is_large, image_name)
        VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          is_large = excluded.is_large,
          image_name = excluded.image_name
      `,
      args: [monster.name.toLowerCase(), monster.isLarge ? 1 : 0, imageName],
    });
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
