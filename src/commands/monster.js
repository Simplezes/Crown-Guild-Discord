import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { handleMonsterAutocomplete, resolveMonsterName } from "../utils.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName("monster")
    .setDescription("📖 Get detailed info about a specific monster")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("The name of the monster")
        .setRequired(true)
        .setAutocomplete(true)
    ),
  async autocomplete(interaction) {
    await handleMonsterAutocomplete(interaction);
  },
  async execute(interaction) {
    const monsterName = interaction.options.getString("name")?.toLowerCase().trim();

    const { MessageFlags } = await import("discord.js");
    const dbMonster = await resolveMonsterName(monsterName);

    if (!dbMonster) {
      return interaction.reply({
        content: `Monster **${monsterName}** not found. Please select one from the list!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const monsterEmoji = dbMonster.emoji || "🐉";
    const displayName = dbMonster.name.charAt(0).toUpperCase() + dbMonster.name.slice(1);
    const jsonPath = path.join(__dirname, "../database/monsters.json");
    let monsterData = null;

    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      monsterData = data.monsters.find(m => m.name.toLowerCase() === dbMonster.name.toLowerCase());
    } catch (e) {
      console.error("Failed to read monsters.json", e);
    }

    if (!monsterData) {
      return interaction.reply({
        content: `Could not find detailed info for **${displayName}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const gameInfo = monsterData.games && monsterData.games.length > 0 ? monsterData.games[0] : null;
    const infoText = gameInfo ? gameInfo.info : "No information available.";
    const imageName = gameInfo ? gameInfo.image : null;

    const embed = new EmbedBuilder()
      .setTitle(`${monsterEmoji} ${displayName}`)
      .setDescription(`*${monsterData.type || "Unknown Type"}*\n\n${infoText}`)
      .setColor(0x3498DB)
      .setTimestamp();

    if (monsterData.elements && monsterData.elements.length > 0) {
      embed.addFields({ name: "🔥 Elements", value: monsterData.elements.join(", "), inline: true });
    } else {
      embed.addFields({ name: "🔥 Elements", value: "None", inline: true });
    }

    if (monsterData.weakness && monsterData.weakness.length > 0) {
      embed.addFields({ name: "🗡️ Weaknesses", value: monsterData.weakness.join(", "), inline: true });
    } else {
      embed.addFields({ name: "🗡️ Weaknesses", value: "Unknown", inline: true });
    }

    if (monsterData.ailments && monsterData.ailments.length > 0) {
      embed.addFields({ name: "☠️ Ailments", value: monsterData.ailments.join(", "), inline: true });
    } else {
      embed.addFields({ name: "☠️ Ailments", value: "None", inline: true });
    }

    const files = [];
    if (imageName) {
      const iconPath = path.join(process.cwd(), "src/database/monsters", imageName);
      if (fs.existsSync(iconPath)) {
        embed.setThumbnail(`attachment://${imageName}`);
        files.push({ attachment: iconPath, name: imageName });
      }
    }

    await interaction.reply({ embeds: [embed], files, flags: MessageFlags.Ephemeral });
  },
};
