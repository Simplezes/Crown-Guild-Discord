import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const PAGE_SIZE = 8;

export function buildNavRow(page, totalPages, stateKey) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`page_prev_${page}_${totalPages}_${stateKey}`)
      .setLabel("← Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`page_next_${page}_${totalPages}_${stateKey}`)
      .setLabel("Next →")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages - 1)
  );
}

export function buildPage(title, entries, page = 0, opts = {}) {
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const pageEntries = entries.slice(start, start + PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(opts.color || 0xC4982A)
    .setDescription(pageEntries.join("\n\n") || "*Nothing here yet.*")
    .setFooter({
      text: `Page ${page + 1} / ${totalPages}  •  ${entries.length} entries${opts.footerSuffix ? "  •  " + opts.footerSuffix : ""}`,
      iconURL: opts.footerIconUrl,
    })
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (opts.thumbnailUrl) embed.setThumbnail(opts.thumbnailUrl);
  if (opts.authorName) embed.setAuthor({ name: opts.authorName, iconURL: opts.authorIconUrl });

  const components = [];
  if (totalPages > 1) {
    components.push(buildNavRow(page, totalPages, opts.stateKey || "x"));
  }

  return { embeds: [embed], components, files: opts.files || [] };
}
