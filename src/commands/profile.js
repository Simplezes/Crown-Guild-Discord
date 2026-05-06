import { SlashCommandBuilder } from "discord.js";
import profileLogic from "../logic/profile.js";
import settingsLogic from "../logic/settings.js";

export default {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your hunter stats or configure settings")
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2)
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View your hunter profile and stats")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user whose profile you want to see")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("settings")
        .setDescription("Configure your guild card settings (Lobby ID, Password)")
        .addStringOption((option) =>
          option
            .setName("lobby_id")
            .setDescription("Your Default Session/Lobby ID")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("password")
            .setDescription("Your Default Quest Password (exactly 4 digits)")
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("Set a custom status message for your Guild Card")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("receive_dms")
            .setDescription("Receive DM notifications for beacon/SOS requests?")
            .setRequired(false)
        )
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "view") return profileLogic.execute(interaction);
    if (sub === "settings") return settingsLogic.execute(interaction);
  },
};
