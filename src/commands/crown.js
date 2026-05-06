import { SlashCommandBuilder } from "discord.js";
import addLogic from "../logic/add.js";
import removeLogic from "../logic/remove.js";
import listLogic from "../logic/list.js";

export default {
  data: new SlashCommandBuilder()
    .setName("crown")
    .setDescription("Manage your monster crown collection")
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a crown with an interactive setup")
        .addStringOption((option) =>
          option
            .setName("monster")
            .setDescription("The monster whose crown you obtained")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a specific crown from your collection")
        .addStringOption((option) =>
          option
            .setName("monster")
            .setDescription("The monster name")
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
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("View your personal crown collection")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The hunter whose collection you want to view")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Permanently delete your ENTIRE collection (Requires confirmation)")
    ),
  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "add") {
      await addLogic.autocomplete(interaction);
    } else if (sub === "remove") {
      await removeLogic.autocomplete(interaction);
    }
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "add") return addLogic.execute(interaction);
    if (sub === "remove") {
      return removeLogic.execute(interaction);
    }
    if (sub === "list") return listLogic.execute(interaction);
    if (sub === "reset") {
      return removeLogic.execute(interaction, "reset");
    }
  },
};
