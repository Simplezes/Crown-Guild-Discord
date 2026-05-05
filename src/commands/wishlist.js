import { SlashCommandBuilder } from "discord.js";
import wishlistLogic from "../logic/wishlist.js";

export default {
  data: new SlashCommandBuilder()
    .setName("wishlist")
    .setDescription("📝 Manage the crowns you are looking for")
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a monster crown to your wishlist")
        .addStringOption((option) =>
          option
            .setName("monster")
            .setDescription("The monster you need")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("The type of crown you need")
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
            .setDescription("Do you specifically need it Tempered?")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a monster from your wishlist")
        .addStringOption((option) =>
          option
            .setName("monster")
            .setDescription("The monster to remove")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View your current wishlist")
    ),
  async autocomplete(interaction) {
    await wishlistLogic.autocomplete(interaction);
  },
  async execute(interaction) {
    return wishlistLogic.execute(interaction);
  },
};
