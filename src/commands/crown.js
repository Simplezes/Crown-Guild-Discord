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
              { name: "Large Crown", value: "large" },
              { name: "Both Crowns", value: "both" }
            )
        )
        .addBooleanOption((option) =>
          option
            .setName("tempered")
            .setDescription("Is the monster Tempered? (Applies to Small if adding both)")
            .setRequired(true)
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
        .addBooleanOption((option) =>
          option
            .setName("tempered_large")
            .setDescription("Is the Large Crown Tempered? (Optional: Use only when adding Both)")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("strength_large")
            .setDescription("Large Crown Strength (1-10 stars) (Optional)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
        )
        .addStringOption((option) =>
          option
            .setName("host_monster")
            .setDescription("Host monster of the quest (if different)")
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("uses")
            .setDescription("Uses for a new Investigation (1-3)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(3)
        )
        .addStringOption((option) =>
          option
            .setName("monster2")
            .setDescription("Second monster in the same quest (if different)")
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName("type2")
            .setDescription("Crown type for the second monster")
            .setRequired(false)
            .addChoices(
              { name: "Small Crown", value: "small" },
              { name: "Large Crown", value: "large" },
              { name: "Both Crowns", value: "both" }
            )
        )
        .addBooleanOption((option) =>
          option
            .setName("tempered2")
            .setDescription("Is the second monster Tempered?")
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("strength2")
            .setDescription("Second monster crown strength (1-10 stars)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
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
