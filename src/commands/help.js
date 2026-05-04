import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import path from "path";
import fs from "fs";
import { E } from "../emojis.js";

const DETAILS = {
  add: {
    title: "📥  /add - Log a Crown",
    fields: [
      { name: "What it does", value: "Records a crown you earned to your personal collection.", inline: false },
      {
        name: "Options", value: [
          `> **monster** - The monster name *(autocomplete supported)*`,
          `> **type** - \`Small Crown\` or \`Large Crown\``,
          `> **tempered** - Was it Tempered? \`Yes\` or \`No\``,
          `> **quest** - The quest type you ran`,
          `> **strength** - Strength Rating (1-10 stars)`,
          `> **uses** - Remaining uses *(Investigation Quests only)*`,
        ].join("\n"), inline: false
      },
      { name: "Notes", value: "> Adding the same monster + type again will update the existing entry.", inline: false },
    ],
  },
  list: {
    title: "📋  /list - View Your Collection",
    fields: [
      { name: "What it does", value: "Shows all crowns you have logged, grouped by monster.", inline: false },
      {
        name: "Notes", value: [
          "> Paginated with **← Prev / Next →** buttons if you have many crowns.",
          "> Visible only to you.",
        ].join("\n"), inline: false
      },
    ],
  },
  remove: {
    title: "🗑️  /remove - Remove Crowns",
    fields: [
      {
        name: "/remove crown", value: [
          "> Removes one specific crown from your collection.",
          "> **monster** - The monster name",
          "> **type** - `Small Crown` or `Large Crown`",
        ].join("\n"), inline: false
      },
      { name: "/remove all", value: "> Deletes your **entire** collection. Requires you to confirm via a button.", inline: false },
    ],
  },
  find: {
    title: `${E.communication}  /find - Browse & Request Crowns`,
    fields: [
      { name: "/find", value: "> Shows the full guild crown registry. Browse with pagination.", inline: false },
      {
        name: "/find monster:{name}", value: [
          "> Shows who holds Small and Large crowns for that monster.",
          "> Click **Request Small Crown** or **Request Large Crown** to broadcast a 60-second LFG ping.",
          "> A host with that crown can click **✅ Accept** - the bot verifies ownership automatically.",
          "> The host's Lobby ID appears in the mission embed if they've set one via `/settings`.",
        ].join("\n"), inline: false
      },
    ],
  },
  complete: {
    title: `${E.notesCheckmark}  /complete - Finish a Mission`,
    fields: [
      { name: "What it does", value: "Marks your active mission as complete and posts a public success message.", inline: false },
      {
        name: "Rules", value: [
          "> Only the **requester** can run this - not the host.",
          "> You can only have **one active mission** at a time.",
          "> Missions expire automatically after **50 minutes** if not completed.",
        ].join("\n"), inline: false
      },
    ],
  },
  profile: {
    title: `${E.expeditionBoard}  /profile - Hunter Card`,
    fields: [
      { name: "What it does", value: "Displays a detailed Guild Hunter Card for you or another player.", inline: false },
      { name: "Options", value: "> **user** *(optional)* - View someone else's profile by mentioning them.", inline: false },
      {
        name: "Shows", value: [
          "> Crown breakdown (Small / Large / Tempered)",
          "> Quests hosted & joined",
          "> Registry completion %",
          "> Top assist crown",
          "> Default lobby info",
        ].join("\n"), inline: false
      },
    ],
  },
  settings: {
    title: `${E.settings}  /settings - Lobby Configuration`,
    fields: [
      { name: "What it does", value: "Saves your default Lobby ID and Quest Password to your profile.", inline: false },
      {
        name: "Options", value: [
          "> **lobby_id** *(optional)* - Your session/lobby ID",
          "> **password** *(optional)* - Your quest password",
        ].join("\n"), inline: false
      },
      { name: "Notes", value: "> These appear automatically when someone accepts your hosting request, so they know where to join.", inline: false },
    ],
  },
  monster: {
    title: "📖  /monster - Monster Info",
    fields: [
      { name: "What it does", value: "Displays lore, type, elements, weaknesses, and ailments for any monster.", inline: false },
      { name: "Options", value: "> **name** - The monster to look up *(autocomplete & fuzzy search supported)*", inline: false },
    ],
  },
};

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View all Crown Guild commands")
    .addStringOption((opt) =>
      opt
        .setName("command")
        .setDescription("Get detailed help for a specific command")
        .setRequired(false)
        .addChoices(
          { name: "/add", value: "add" },
          { name: "/list", value: "list" },
          { name: "/remove", value: "remove" },
          { name: "/find", value: "find" },
          { name: "/complete", value: "complete" },
          { name: "/profile", value: "profile" },
          { name: "/settings", value: "settings" },
          { name: "/monster", value: "monster" },
        )
    ),
  async execute(interaction) {
    const iconPath = path.join(process.cwd(), "icon.png");
    const files = fs.existsSync(iconPath) ? [{ attachment: iconPath, name: "icon.png" }] : [];
    const commandKey = interaction.options.getString("command");

    if (commandKey && DETAILS[commandKey]) {
      const detail = DETAILS[commandKey];
      const embed = new EmbedBuilder()
        .setAuthor({ name: "Crown Guild  •  Command Help", iconURL: "attachment://icon.png" })
        .setTitle(detail.title)
        .setColor(0xC4982A)
        .addFields(...detail.fields)
        .setFooter({ text: "Run /help to see all commands", iconURL: "attachment://icon.png" });

      return interaction.reply({ embeds: [embed], files, flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: "Crown Guild  •  Command Guide", iconURL: "attachment://icon.png" })
      .setColor(0xC4982A)
      .setThumbnail("attachment://icon.png")
      .setDescription("> 💡 Tip: Use `/help command:` for detailed info on any command!")
      .addFields(
        {
          name: "🗂️  Collection",
          value: [
            "`/add` - Log a crown",
            "`/list` - View your collection",
            "`/remove crown` - Remove a crown",
            "`/remove all` - Clear everything",
          ].join("\n"),
          inline: true,
        },
        {
          name: `${E.communication}  Matchmaking`,
          value: [
            "`/find` - Browse crown registry",
            "`/find monster:` - Find holders & request",
            "`/complete` - Mark your mission done",
          ].join("\n"),
          inline: true,
        },
        {
          name: `${E.expeditionBoard}  Profile`,
          value: [
            "`/profile` - View your Hunter Card",
            "`/settings` - Set Lobby ID & password",
            "`/monster` - Look up a monster",
          ].join("\n"),
          inline: true,
        }
      )
      .setFooter({ text: "Crown Guild Official Registry  •  Happy Hunting!", iconURL: "attachment://icon.png" });

    await interaction.reply({ embeds: [embed], files, flags: MessageFlags.Ephemeral });
  },
};
