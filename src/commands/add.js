import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { handleMonsterAutocomplete, resolveMonsterName } from "../utils.js";
import { E } from "../emojis.js";
import path from "path";
import fs from "fs";

export default {
  data: new SlashCommandBuilder()
    .setName("add")
    .setDescription("Add a monster crown to your collection")
    .addStringOption((option) =>
      option
        .setName("monster")
        .setDescription("The monster whose crown you obtained")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("The type of crown")
        .setRequired(true)
        .addChoices(
          { name: "Small Crown", value: "small" },
          { name: "Large Crown", value: "large" }
        )
    )
    .addBooleanOption((option) =>
      option
        .setName("tempered")
        .setDescription("Is the monster Tempered?")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("quest")
        .setDescription("The type of quest")
        .setRequired(true)
        .addChoices(
          { name: "Event Quests", value: "Event Quests" },
          { name: "Optional Quests", value: "Optional Quests" },
          { name: "Field Survey Quests", value: "Field Survey Quests" },
          { name: "Investigation Quests", value: "Investigation Quests" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("strength")
        .setDescription("Strength Rating (1-10 stars)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10)
    )
    .addStringOption((option) =>
      option
        .setName("host_monster")
        .setDescription("Host monster of the investigation or field survey — if different from the crown monster")
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("uses")
        .setDescription("Uses for a new Investigation (1-3). Omit to auto-link to an existing one.")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(3)
    ),
  async autocomplete(interaction) {
    await handleMonsterAutocomplete(interaction);
  },
  async execute(interaction) {
    const monsterName = interaction.options.getString("monster")?.toLowerCase().trim();
    const type = interaction.options.getString("type");
    const tempered = interaction.options.getBoolean("tempered");
    const quest = interaction.options.getString("quest");
    const strength = interaction.options.getInteger("strength");
    const hostMonsterInput = interaction.options.getString("host_monster")?.toLowerCase().trim();
    const usesInput = interaction.options.getInteger("uses");
    const userId = interaction.user.id;

    await db.execute({
      sql: "INSERT OR IGNORE INTO users(id) VALUES (?)",
      args: [userId],
    });

    const monster = await resolveMonsterName(monsterName);
    if (!monster) {
      return interaction.reply({
        content: `Monster **${monsterName}** not found. Please select one from the list!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const monsterId = monster.id;
    let displayName = monster.name.charAt(0).toUpperCase() + monster.name.slice(1);
    if (tempered) displayName = `Tempered ${displayName}`;
    const monsterEmoji = monster.emoji || "🐉";

    let investigationId = null;
    let investigationLine = "";

    if (quest === "Investigation Quests" || quest === "Field Survey Quests") {
      let invMonster = monster;

      if (hostMonsterInput) {
        const resolved = await resolveMonsterName(hostMonsterInput);
        if (!resolved) {
          return interaction.reply({
            content: `Host monster **${hostMonsterInput}** not found. Please select one from the list!`,
            flags: MessageFlags.Ephemeral,
          });
        }
        invMonster = resolved;
      }

      const invMonsterName = invMonster.name.charAt(0).toUpperCase() + invMonster.name.slice(1);

      if (quest === "Field Survey Quests") {
        if (invMonster.id !== monsterId) {
          const invRes = await db.execute({
            sql: "INSERT INTO investigations (user_id, monster_id, remaining_uses) VALUES (?, ?, NULL)",
            args: [userId, invMonster.id],
          });
          investigationId = invRes.lastInsertRowid;
          investigationLine = `**Field Survey:** ${invMonsterName}'s quest`;
        }
      } else {
        if (usesInput) {
          const invRes = await db.execute({
            sql: "INSERT INTO investigations (user_id, monster_id, remaining_uses) VALUES (?, ?, ?)",
            args: [userId, invMonster.id, usesInput],
          });
          investigationId = invRes.lastInsertRowid;
          investigationLine = `**Investigation:** ${invMonsterName} (${usesInput} use${usesInput !== 1 ? "s" : ""})`;
        } else {
          const existingRes = await db.execute({
            sql: "SELECT id, remaining_uses FROM investigations WHERE user_id = ? AND monster_id = ? ORDER BY id DESC LIMIT 1",
            args: [userId, invMonster.id],
          });

          if (existingRes.rows.length > 0) {
            const existing = existingRes.rows[0];
            investigationId = existing.id;
            investigationLine = `**Investigation:** ${invMonsterName} *(linked to existing, ${existing.remaining_uses} use${existing.remaining_uses !== 1 ? "s" : ""} left)*`;
          } else {
            const invRes = await db.execute({
              sql: "INSERT INTO investigations (user_id, monster_id, remaining_uses) VALUES (?, ?, ?)",
              args: [userId, invMonster.id, 3],
            });
            investigationId = invRes.lastInsertRowid;
            investigationLine = `**Investigation:** ${invMonsterName} (3 uses)`;
          }
        }
      }
    }

    await db.execute({
      sql: `
        INSERT INTO crowns(user_id, monster_id, type, tempered, strength_rating, quest, remaining_uses, investigation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [userId, monsterId, type, tempered ? 1 : 0, strength, quest, null, investigationId],
    });

    const typeEmoji = type === "small" ? E.smallCrown : E.largeCrown;
    const typeLabel = type === "small" ? "Small Crown" : "Large Crown";

    const descLines = [
      `Successfully recorded the ${typeEmoji} **${typeLabel}** for **${displayName}**!`,
      "",
      `**Quest:** ${quest}`,
      `**Strength:** ${strength}★`,
    ];
    if (investigationLine) descLines.push(investigationLine);

    const embed = new EmbedBuilder()
      .setTitle(`${monsterEmoji} Crown Added!`)
      .setDescription(descLines.join("\n"))
      .setColor(0x57f287)
      .setTimestamp();

    if (interaction.client.pusher) {
      interaction.client.pusher.trigger("public-channel", "crown_update", {});
    }

    const files = [];
    if (monster.image_name) {
      const iconPath = path.join(process.cwd(), "src/database/monsters", monster.image_name);
      if (fs.existsSync(iconPath)) {
        embed.setThumbnail(`attachment://${monster.image_name}`);
        files.push({ attachment: iconPath, name: monster.image_name });
      }
    }

    await interaction.reply({ embeds: [embed], files, flags: MessageFlags.Ephemeral });
  },
};


