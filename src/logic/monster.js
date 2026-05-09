import { EmbedBuilder, MessageFlags } from "discord.js";
import { handleMonsterAutocomplete, resolveMonsterName } from "../utils.js";
import path from "path";
import fs from "fs";
import { ephemeralStatus } from "../responseEmbeds.js";
import { E } from "../emojis.js";

export default {
  async autocomplete(interaction) {
    await handleMonsterAutocomplete(interaction);
  },
  async execute(interaction) {
    const monsterName = interaction.options.getString("name")?.toLowerCase().trim();

    const monster = await resolveMonsterName(monsterName);
    if (!monster) {
      return interaction.reply(
        ephemeralStatus({
          title: "Monster Not Found",
          description: `No monster matched **${monsterName}**. Try selecting one from autocomplete.`,
          tone: "warning",
        })
      );
    }

    const monsters = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/database/monsters.json"), "utf8")).monsters;
    const monsterData = monsters.find(m => m.name.toLowerCase() === monster.name.toLowerCase());

    if (!monsterData) {
      return interaction.reply(
        ephemeralStatus({
          title: "Lore Unavailable",
          description: "Lore data for this monster is not available yet.",
          tone: "neutral",
        })
      );
    }

    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const mName = monster.name.split(' ').map(capitalize).join(' ');

    const embed = new EmbedBuilder()
      .setTitle(`${monster.emoji || E.hunt} ${mName}`)
      .setDescription(monsterData.description || "No description available.")
      .setColor(0xC4982A)
      .addFields(
        { name: "Type", value: monsterData.type || "Unknown", inline: true },
        { name: "Elements", value: monsterData.elements?.join(", ") || "None", inline: true },
        { name: "Ailments", value: monsterData.ailments?.join(", ") || "None", inline: true }
      );

    if (monsterData.weaknesses) {
      const weakStr = Object.entries(monsterData.weaknesses)
        .map(([el, star]) => `${el}: ${star}/5`)
        .join("\n");
      embed.addFields({ name: "Weaknesses", value: weakStr || "Unknown", inline: false });
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
