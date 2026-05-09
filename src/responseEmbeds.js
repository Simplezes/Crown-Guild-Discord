import { EmbedBuilder, MessageFlags } from "discord.js";

const TONE_COLORS = {
  info: 0x3498DB,
  success: 0x2ECC71,
  warning: 0xF1C40F,
  danger: 0xED4245,
  neutral: 0x95A5A6,
};

export function buildStatusEmbed({ title, description, tone = "info" }) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(TONE_COLORS[tone] || TONE_COLORS.info)
    .setTimestamp();
}

export function ephemeralStatus({ title, description, tone = "info" }) {
  return {
    embeds: [buildStatusEmbed({ title, description, tone })],
    flags: MessageFlags.Ephemeral,
  };
}