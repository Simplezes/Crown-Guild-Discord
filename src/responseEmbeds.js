import { EmbedBuilder, MessageFlags } from "discord.js";

// Mirrors the website's MH palette (web/src/app/globals.css --mh-* variables)
// so bot embeds and the web hub read as the same brand.
export const COLORS = {
  brand: 0xB59A5D,     // --mh-gold
  bright: 0xE0CC96,    // --mh-gold-bright
  info: 0xB59A5D,
  success: 0x6B9C5E,   // muted moss green, warm-compatible with the brand
  warning: 0xC9902A,   // amber-gold
  danger: 0x8B2E2E,    // --mh-red
  urgent: 0xB2472A,    // warmer red-orange, for time-sensitive SOS flares
  neutral: 0x6E645A,   // --mh-tan-dark / --mh-umber family
  legendary: 0xA335EE, // --mh-purple
};

const TONE_COLORS = {
  info: COLORS.info,
  success: COLORS.success,
  warning: COLORS.warning,
  danger: COLORS.danger,
  neutral: COLORS.neutral,
};

export const BRAND_NAME = "Crown Guild";
export const BRAND_ICON_URL = process.env.WEB_HUB_URL ? `${process.env.WEB_HUB_URL}/icon.png` : undefined;

// Stamps the Crown Guild footer icon onto an embed without clobbering any
// footer text it already has.
export function applyBrandFooter(embed, text) {
  const existing = embed.data?.footer;
  return embed.setFooter({
    text: text || existing?.text || BRAND_NAME,
    iconURL: existing?.iconURL || BRAND_ICON_URL,
  });
}

export function buildStatusEmbed({ title, description, tone = "info" }) {
  return applyBrandFooter(
    new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(TONE_COLORS[tone] || TONE_COLORS.info)
      .setTimestamp()
  );
}

export function ephemeralStatus({ title, description, tone = "info" }) {
  return {
    embeds: [buildStatusEmbed({ title, description, tone })],
    flags: MessageFlags.Ephemeral,
  };
}
