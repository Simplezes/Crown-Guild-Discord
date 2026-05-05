import { EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { handleMonsterAutocomplete, resolveMonsterName } from "../utils.js";
import { E } from "../emojis.js";

export default {
  async autocomplete(interaction) {
    await handleMonsterAutocomplete(interaction);
  },
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "add") {
      const monsterName = interaction.options.getString("monster")?.toLowerCase().trim();
      const type = interaction.options.getString("type");
      const tempered = interaction.options.getBoolean("tempered") ? 1 : 0;

      const monster = await resolveMonsterName(monsterName);
      if (!monster) {
        return interaction.reply({ content: `Monster **${monsterName}** not found.`, flags: MessageFlags.Ephemeral });
      }

      await db.execute({
        sql: "INSERT OR REPLACE INTO wishlist (user_id, monster_id, type, tempered) VALUES (?, ?, ?, ?)",
        args: [userId, monster.id, type, tempered]
      });

      const typeLabel = type === 'both' ? "Small & Large Crowns" : (type === 'small' ? "Small Crown" : "Large Crown");
      const tempLabel = tempered ? "Tempered " : "";

      return interaction.reply({
        content: `✅ Added **${tempLabel}${monster.name}** (${typeLabel}) to your wishlist!`,
        flags: MessageFlags.Ephemeral
      });

    } else if (sub === "remove") {
      const monsterName = interaction.options.getString("monster")?.toLowerCase().trim();
      const monster = await resolveMonsterName(monsterName);
      
      if (!monster) {
        return interaction.reply({ content: `Monster **${monsterName}** not found.`, flags: MessageFlags.Ephemeral });
      }

      await db.execute({
        sql: "DELETE FROM wishlist WHERE user_id = ? AND monster_id = ?",
        args: [userId, monster.id]
      });

      return interaction.reply({
        content: `🗑️ Removed **${monster.name}** from your wishlist.`,
        flags: MessageFlags.Ephemeral
      });

    } else if (sub === "view") {
      const res = await db.execute({
        sql: `
          SELECT w.*, m.name as monster_name, m.emoji 
          FROM wishlist w 
          JOIN monsters m ON w.monster_id = m.id 
          WHERE w.user_id = ?
          ORDER BY m.name ASC
        `,
        args: [userId]
      });

      if (res.rows.length === 0) {
        return interaction.reply({ content: "Your wishlist is empty!", flags: MessageFlags.Ephemeral });
      }

      const list = res.rows.map(row => {
        const typeLabel = row.type === 'both' ? "Both" : (row.type === 'small' ? "Small" : "Large");
        const tempLabel = row.tempered ? `${E.tempered} ` : "";
        return `> ${row.emoji} **${row.monster_name}** (${tempLabel}${typeLabel})`;
      });

      const embed = new EmbedBuilder()
        .setTitle("📝 Your Crown Wishlist")
        .setDescription(list.join("\n"))
        .setColor(0x9B59B6)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
