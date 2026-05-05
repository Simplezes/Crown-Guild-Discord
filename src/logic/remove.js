import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import db from "../database.js";
import { handleMonsterAutocomplete, resolveMonsterName } from "../utils.js";
import { E } from "../emojis.js";
import path from "path";
import fs from "fs";

export default {
  async autocomplete(interaction) {
    await handleMonsterAutocomplete(interaction);
  },
  async execute(interaction, subOverride = null) {
    const sub = subOverride || interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "reset" || sub === "all") {
      const countRes = await db.execute({
        sql: "SELECT COUNT(*) as total FROM crowns WHERE user_id = ?",
        args: [userId],
      });
      const total = countRes.rows[0].total;

      if (total === 0) {
        return interaction.reply({
          content: "Your collection is already empty!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_remove_all_${userId}`)
          .setLabel(`Yes, delete all ${total} crowns`)
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`cancel_remove_all_${userId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary)
      );

      const embed = new EmbedBuilder()
        .setTitle("⚠️ Are you sure?")
        .setDescription(`This will permanently delete all **${total} crowns** from your collection. This cannot be undone.`)
        .setColor(0xed4245);

      return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }

    const monsterName = interaction.options.getString("monster")?.toLowerCase().trim();
    const type = interaction.options.getString("type");
    const monster = await resolveMonsterName(monsterName);

    if (!monster) {
      return interaction.reply({
        content: `Monster **${monsterName}** not found.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const displayName = monster.name.charAt(0).toUpperCase() + monster.name.slice(1);
    const monsterEmoji = monster.emoji || "🐉";

    const crownRes = await db.execute({
      sql: "SELECT id, investigation_id, tempered, strength_rating FROM crowns WHERE user_id = ? AND monster_id = ? AND type = ? ORDER BY id DESC LIMIT 1",
      args: [userId, monster.id, type]
    });

    if (crownRes.rows.length === 0) {
      const typeEmoji = type === "small" ? E.smallCrown : E.largeCrown;
      const typeLabel = type === "small" ? "Small Crown" : "Large Crown";
      return interaction.reply({
        content: `${monsterEmoji} You don't have a ${typeEmoji} **${typeLabel}** for **${displayName}** in your collection.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const crown = crownRes.rows[0];
    const crownId = crown.id;
    const investigationId = crown.investigation_id ?? null;

    await db.execute({
      sql: "UPDATE web_notifications SET crown_id = NULL WHERE crown_id = ?",
      args: [crownId],
    });

    await db.execute({
      sql: "DELETE FROM crowns WHERE id = ?",
      args: [crownId],
    });

    if (investigationId) {
      const stillLinked = await db.execute({
        sql: "SELECT COUNT(*) as c FROM crowns WHERE investigation_id = ?",
        args: [investigationId],
      });
      if ((stillLinked.rows[0]?.c ?? 1) === 0) {
        await db.execute({
          sql: "DELETE FROM investigations WHERE id = ?",
          args: [investigationId],
        });
      }
    }

    const typeEmoji = type === "small" ? E.smallCrown : E.largeCrown;
    const typeLabel = type === "small" ? "Small Crown" : "Large Crown";
    const finalDisplayName = crown.tempered ? `Tempered ${displayName}` : displayName;
    const displaySuffix = `(${crown.strength_rating}★)`;

    const embed = new EmbedBuilder()
      .setTitle(`${monsterEmoji} Crown Removed`)
      .setDescription(`Successfully removed the ${typeEmoji} **${typeLabel}** for **${finalDisplayName}** ${displaySuffix} from your collection.`)
      .setColor(0xed4245)
      .setTimestamp();

    if (interaction.client.pusher) {
      interaction.client.pusher.trigger("public-channel", "crown_update", {});
    }

    const files = [];
    if (monster.image_name) {
      const iconPath = path.join(process.cwd(), "src/database/monsters", monster.image_name);
      if (fs.existsSync(iconPath)) {
        embed.setThumbnail(`attachment://${monster.image_name}`);
        files.push({ attachment: iconPath, name: monster.image_name });
      }
    }

    await interaction.reply({ embeds: [embed], files, flags: MessageFlags.Ephemeral });
  },
};
