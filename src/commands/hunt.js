import { SlashCommandBuilder } from "discord.js";
import flareLogic from "../logic/flare.js";
import radarLogic from "../logic/radar.js";
import findLogic from "../logic/find.js";
import matchLogic from "../logic/match.js";
import completeLogic from "../logic/complete.js";
import { SOS_DISABLED_MESSAGE, SOS_FEATURE_ENABLED } from "../featureFlags.js";
import { ephemeralStatus } from "../responseEmbeds.js";

const huntCommand = new SlashCommandBuilder()
  .setName("hunt")
  .setDescription("Multiplayer crown hunting activities")
  .setIntegrationTypes(0, 1)
  .setContexts(0, 1, 2)
  .addSubcommand((sub) =>
    sub
      .setName("match")
      .setDescription("Match with hunters who need what you have, or have what you need")
      .addStringOption((option) =>
        option
          .setName("monster")
          .setDescription("The monster to match for (Optional)")
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addStringOption((option) =>
        option
          .setName("role")
          .setDescription("Are you looking for a host or looking for hunters to join you?")
          .addChoices(
            { name: "I am Seeking (Find me a Host)", value: "seeker" },
            { name: "I am Hosting (Find me Hunters)", value: "host" }
          )
          .setRequired(false)
      )
  );

if (SOS_FEATURE_ENABLED) {
  huntCommand
    .addSubcommand((sub) =>
      sub
        .setName("flare")
        .setDescription("Fire an SOS Flare to host a crown hunt")
        .addStringOption((option) =>
          option
            .setName("monster")
            .setDescription("The monster you are hosting")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName("session_id")
            .setDescription("Your Lobby ID (Optional, overrides settings)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("radar")
        .setDescription("Scan for active SOS flares and crown hunts")
    )
    .addSubcommand((sub) =>
      sub
        .setName("find")
        .setDescription("Find players who have a specific monster's crowns")
        .addStringOption((option) =>
          option
            .setName("monster")
            .setDescription("The monster to search for (Leave empty to browse all)")
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("done")
        .setDescription("Mark your current active hunt as completed")
    );
}

const huntCommandData = huntCommand;

export default {
  data: huntCommandData,
  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    if (!SOS_FEATURE_ENABLED && sub !== "match") {
      return interaction.respond([]);
    }
    if (sub === "flare") await flareLogic.autocomplete(interaction);
    if (sub === "find") await findLogic.autocomplete(interaction);
    if (sub === "match") {
      const monsterOption = interaction.options.getFocused(true);
      if (monsterOption.name === "monster") {
        await findLogic.autocomplete(interaction);
      }
    }
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (!SOS_FEATURE_ENABLED && sub !== "match") {
      return interaction.reply(
        ephemeralStatus({
          title: "Hunt System Offline",
          description: SOS_DISABLED_MESSAGE,
          tone: "warning",
        })
      );
    }
    if (sub === "flare") return flareLogic.execute(interaction);
    if (sub === "radar") return radarLogic.execute(interaction);
    if (sub === "find") return findLogic.execute(interaction);
    if (sub === "match") return matchLogic.execute(interaction);
    if (sub === "done") return completeLogic.execute(interaction);
  },
};
