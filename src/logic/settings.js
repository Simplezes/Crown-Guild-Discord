import { EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { E } from "../emojis.js";
import { ephemeralStatus, COLORS, applyBrandFooter } from "../responseEmbeds.js";

export default {
  async execute(interaction) {
    const lobbyId = interaction.options.getString("lobby_id");
    const password = interaction.options.getString("password");
    const normalizedPassword = password === null ? null : password.trim();
    const status = interaction.options.getString("status");
    const receiveDms = interaction.options.getBoolean("receive_dms");
    const userId = interaction.user.id;

    const updates = [];
    const args = [];

    if (normalizedPassword !== null && normalizedPassword !== "" && !/^\d{4}$/.test(normalizedPassword)) {
      return interaction.reply(
        ephemeralStatus({
          title: "Invalid Password",
          description: "Quest Password must be exactly 4 digits.",
          tone: "warning",
        })
      );
    }

    if (status !== null && status.length > 200) {
      return interaction.reply(
        ephemeralStatus({
          title: "Status Too Long",
          description: "Status message must be 200 characters or fewer.",
          tone: "warning",
        })
      );
    }

    if (lobbyId !== null) { updates.push("lobby_id = ?"); args.push(lobbyId); }
    if (normalizedPassword !== null) { updates.push("quest_password = ?"); args.push(normalizedPassword); }
    if (status !== null) { updates.push("status_message = ?"); args.push(status); }
    if (receiveDms !== null) { updates.push("receive_dms = ?"); args.push(receiveDms ? 1 : 0); }

    if (updates.length === 0) {
      return interaction.reply(
        ephemeralStatus({
          title: "Nothing To Update",
          description: "Provide at least one setting option to update.",
          tone: "neutral",
        })
      );
    }

    args.push(userId);

    await db.execute({
      sql: `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    const embed = new EmbedBuilder()
      .setTitle(`${E.settings} Settings Updated`)
      .setDescription("Your hunter profile has been successfully updated.")
      .setColor(COLORS.brand)
      .setTimestamp();
    applyBrandFooter(embed);

    if (lobbyId) embed.addFields({ name: "Lobby ID", value: `\`${lobbyId}\``, inline: true });
    if (normalizedPassword) embed.addFields({ name: "Password", value: `\`${normalizedPassword}\``, inline: true });
    if (receiveDms !== null) embed.addFields({ name: "DM Notifications", value: receiveDms ? "Enabled" : "Disabled", inline: true });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
