import { SlashCommandBuilder } from "discord.js";
import { executeCompare } from "../logic/wishlist.js";

export default {
  data: new SlashCommandBuilder()
    .setName("compare")
    .setDescription("Compare two hunters across crowns, collections, and wishlist goals")
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2)
    .addUserOption((option) =>
      option
        .setName("hunter_a")
        .setDescription("First hunter to compare")
        .setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName("hunter_b")
        .setDescription("Second hunter to compare")
        .setRequired(true)
    ),
  async execute(interaction) {
    return executeCompare(interaction);
  },
};