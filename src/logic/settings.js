import { EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";

export default {
  async execute(interaction) {
    const lobbyId = interaction.options.getString("lobby_id");
    const password = interaction.options.getString("password");
    const status = interaction.options.getString("status");
    const receiveDms = interaction.options.getBoolean("receive_dms");
    const userId = interaction.user.id;

    const updates = [];
    const args = [];

    if (lobbyId !== null) { updates.push("lobby_id = ?"); args.push(lobbyId); }
    if (password !== null) { updates.push("quest_password = ?"); args.push(password); }
    if (status !== null) { updates.push("status_message = ?"); args.push(status); }
    if (receiveDms !== null) { updates.push("receive_dms = ?"); args.push(receiveDms ? 1 : 0); }

    if (updates.length === 0) {
      return interaction.reply({ content: "Please provide at least one setting to update!", flags: MessageFlags.Ephemeral });
    }

    args.push(userId);

    await db.execute({
      sql: `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    const embed = new EmbedBuilder()
      .setTitle(`${E.settings} Settings Updated`)
      .setDescription("Your hunter profile has been successfully updated.")
      .setColor(0x3498DB)
      .setTimestamp();

    if (lobbyId) embed.addFields({ name: "Lobby ID", value: `\`${lobbyId}\``, inline: true });
    if (password) embed.addFields({ name: "Password", value: `\`${password}\``, inline: true });
    if (receiveDms !== null) embed.addFields({ name: "DM Notifications", value: receiveDms ? "Enabled" : "Disabled", inline: true });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
