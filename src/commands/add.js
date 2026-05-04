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
        .setDescription("The name of the monster")
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
    .addIntegerOption((option) =>
      option
        .setName("uses")
        .setDescription("Number of uses (max 3 for Investigations)")
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
    if (tempered) {
      displayName = `Tempered ${displayName}`;
    }
    const monsterEmoji = monster.emoji || "🐉";
    const remainingUses = quest === "Investigation Quests" ? (usesInput || 3) : null;

    await db.execute({
      sql: `
        INSERT INTO crowns(user_id, monster_id, type, tempered, strength_rating, quest, remaining_uses) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [userId, monsterId, type, tempered ? 1 : 0, strength, quest, remainingUses],
    });

    const typeEmoji = type === "small" ? E.smallCrown : E.largeCrown;
    const typeLabel = type === "small" ? "Small Crown" : "Large Crown";

    const embed = new EmbedBuilder()
      .setTitle(`${monsterEmoji} Crown Added!`)
      .setDescription(`Successfully recorded the ${typeEmoji} **${typeLabel}** for **${displayName}**!\n\n**Quest:** ${quest}\n**Strength:** ${strength}★`)
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


