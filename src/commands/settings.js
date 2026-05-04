import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";

export default {
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Configure your guild card settings (Lobby ID, Password)")
    .addStringOption((option) =>
      option
        .setName("lobby_id")
        .setDescription("Your default Lobby ID for hosting quests")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("password")
        .setDescription("Your default quest password (if any)")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("receive_dms")
        .setDescription("Receive bot DMs for new hunt requests? (Default: True)")
        .setRequired(false)
    ),
  async execute(interaction) {
    const userId = interaction.user.id;
    const lobbyId = interaction.options.getString("lobby_id");
    const password = interaction.options.getString("password");
    const receiveDms = interaction.options.getBoolean("receive_dms");

    await db.execute({
      sql: "INSERT OR IGNORE INTO users(id) VALUES (?)",
      args: [userId]
    });

    if (lobbyId !== null) {
      await db.execute({
        sql: "UPDATE users SET lobby_id = ? WHERE id = ?",
        args: [lobbyId, userId]
      });
    }

    if (password !== null) {
      await db.execute({
        sql: "UPDATE users SET quest_password = ? WHERE id = ?",
        args: [password, userId]
      });
    }

    if (receiveDms !== null) {
      await db.execute({
        sql: "UPDATE users SET receive_dms = ? WHERE id = ?",
        args: [receiveDms ? 1 : 0, userId]
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`${E.settings} Hunter Settings`)
      .setDescription("Your settings have been updated! You can also manage your account below.")
      .setColor(0x3498DB)
      .addFields(
        { name: `${E.lobby} Lobby ID`, value: lobbyId !== null ? lobbyId : "*(Unchanged)*", inline: true },
        { name: "Quest Password", value: password !== null ? password : "*(Unchanged)*", inline: true },
        { name: "Receive DMs", value: receiveDms !== null ? (receiveDms ? "Yes" : "No") : "*(Unchanged)*", inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_delete_account_init_${userId}`)
        .setLabel("Delete Account")
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },
};
