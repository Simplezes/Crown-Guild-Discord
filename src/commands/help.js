import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import path from "path";
import fs from "fs";
import { E } from "../emojis.js";
import { SOS_FEATURE_ENABLED } from "../featureFlags.js";
import { COLORS } from "../responseEmbeds.js";

const huntActions = SOS_FEATURE_ENABLED
  ? [
    "> `flare` - Broadcast a hunt you are hosting",
    "> `radar` - Scan for active SOS flares",
    "> `find` - Search the global registry for specific holders",
    "> `match` - Find mutual matches (those who need what you have)",
    "> `done` - Mark your active hunt as completed",
  ]
  : [
    "> `match` - Find hunters who have crowns you need",
  ];

const GROUPS = {
  crown: {
    title: `${E.completedObj}  /crown - Collection Management`,
    fields: [
      {
        name: "Actions", value: [
          "> `add` - Log a new crown you've earned",
          "> `remove` - Delete a specific crown entry",
          "> `list` - View your collection (or another hunter's)",
          "> `reset` - Clear your entire collection",
        ].join("\n"), inline: false
      }
    ]
  },
  hunt: {
    title: `${E.hunt}  /hunt - Multiplayer Activities`,
    fields: [
      {
        name: "Actions", value: huntActions.join("\n"), inline: false
      }
    ]
  },
  wishlist: {
    title: `${E.notesCheckmark}  /wishlist - Missing Crowns`,
    fields: [
      {
        name: "Actions", value: [
          "> `add` - Add a crown you are looking for",
          "> `remove` - Remove from your list",
          "> `view` - See your current wishlist",
        ].join("\n"), inline: false
      }
    ]
  },
  profile: {
    title: `${E.expeditionBoard}  /profile - Personal Info`,
    fields: [
      {
        name: "Actions", value: [
          "> `view` - See your Hunter Card and stats",
          "> `share` - Post a Discord-ready profile share",
          "> `settings` - Configure Lobby ID, Password, and DMs",
        ].join("\n"), inline: false
      }
    ]
  },
  monster: {
    title: `${E.expeditionBoard}  /monster - Bestiary`,
    fields: [
      {
        name: "Actions", value: [
          "> `info` - View weaknesses, elements, and lore",
        ].join("\n"), inline: false
      }
    ]
  }
};

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View the Crown Guild command guide")
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2)
    .addStringOption((opt) =>
      opt
        .setName("category")
        .setDescription("Get detailed help for a specific command group")
        .setRequired(false)
        .addChoices(
          { name: "/crown", value: "crown" },
          { name: "/hunt", value: "hunt" },
          { name: "/wishlist", value: "wishlist" },
          { name: "/profile", value: "profile" },
          { name: "/monster", value: "monster" },
        )
    ),
  async execute(interaction) {
    const iconPath = path.join(process.cwd(), "icon.png");
    const files = fs.existsSync(iconPath) ? [{ attachment: iconPath, name: "icon.png" }] : [];
    const category = interaction.options.getString("category");

    if (category && GROUPS[category]) {
      const group = GROUPS[category];
      const embed = new EmbedBuilder()
        .setAuthor({ name: "Crown Guild  •  Group Help", iconURL: "attachment://icon.png" })
        .setTitle(group.title)
        .setColor(COLORS.brand)
        .addFields(...group.fields)
        .setFooter({ text: "Run /help to see all categories", iconURL: "attachment://icon.png" });

      return interaction.reply({ embeds: [embed], files, flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: "Crown Guild  •  Command Guide", iconURL: "attachment://icon.png" })
      .setColor(COLORS.brand)
      .setThumbnail("attachment://icon.png")
      .setDescription("The Crown Guild is now easier to navigate! Use the grouped commands below:")
      .addFields(
        { name: `${E.completedObj}  /crown`, value: "Manage your monster crown collection.", inline: true },
        { name: `${E.hunt}  /hunt`, value: "SOS flares, Radar, and Matchmaking.", inline: true },
        { name: `${E.notesCheckmark}  /wishlist`, value: "Track the crowns you are seeking.", inline: true },
        { name: `${E.questMembers}  /profile`, value: "View your card and set your Lobby ID.", inline: true },
        { name: `${E.expeditionBoard}  /monster`, value: "Lookup weaknesses and bestiary info.", inline: true }
      )
      .setFooter({ text: "Type / then select a group to see all actions!", iconURL: "attachment://icon.png" });

    await interaction.reply({ embeds: [embed], files, flags: MessageFlags.Ephemeral });
  },
};
