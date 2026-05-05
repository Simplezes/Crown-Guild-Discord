import { SlashCommandBuilder } from "discord.js";
import monsterLogic from "../logic/monster.js";

export default {
  data: new SlashCommandBuilder()
    .setName("monster")
    .setDescription("📖 Get detailed info about a specific monster")
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2)
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("View lore, weaknesses, and element info")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("The monster's name")
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),
  async autocomplete(interaction) {
    await monsterLogic.autocomplete(interaction);
  },
  async execute(interaction) {
    return monsterLogic.execute(interaction);
  },
};
