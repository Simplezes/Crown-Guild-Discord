import { EmbedBuilder, MessageFlags } from "discord.js";
import db from "../database.js";
import { handleMonsterAutocomplete, resolveMonsterName, capitalize, formatMonsterName } from "../utils.js";
import { E } from "../emojis.js";
import crypto from "crypto";

const WEB_BASE_URL = process.env.WEB_HUB_URL;

export default {
  async autocomplete(interaction) {
    await handleMonsterAutocomplete(interaction);
  },
  async execute(interaction) {
    const monsterName = interaction.options.getString("monster")?.toLowerCase().trim();
    const typeInput = interaction.options.getString("type");
    const types = typeInput === "both" ? ["small", "large"] : [typeInput];
    const tempered = interaction.options.getBoolean("tempered");
    const strength = interaction.options.getInteger("strength");
    const temperedLarge = interaction.options.getBoolean("tempered_large");
    const strengthLarge = interaction.options.getInteger("strength_large");

    const monster2Name = interaction.options.getString("monster2")?.toLowerCase().trim();
    const type2Input = interaction.options.getString("type2");
    const tempered2 = interaction.options.getBoolean("tempered2");
    const strength2 = interaction.options.getInteger("strength2");

    const quest = interaction.options.getString("quest");
    const hostMonsterInput = interaction.options.getString("host_monster")?.toLowerCase().trim();
    const usesInput = interaction.options.getInteger("uses");
    const userId = interaction.user.id;

    await db.execute({
      sql: "INSERT OR IGNORE INTO users(id) VALUES (?)",
      args: [userId],
    });

    const monster = await resolveMonsterName(monsterName);
    if (!monster) {
      return interaction.reply({
        content: `Monster **${monsterName}** not found. Please select one from the list!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const monsterId = monster.id;
    let displayName = formatMonsterName(monster.name, tempered);
    const monsterEmoji = monster.emoji || "🐉";

    let monster2 = null;
    if (monster2Name) {
      if (!type2Input) {
        return interaction.reply({
          content: `Please specify the crown type (\`type2\`) for the second monster!`,
          flags: MessageFlags.Ephemeral,
        });
      }
      monster2 = await resolveMonsterName(monster2Name);
      if (!monster2) {
        return interaction.reply({
          content: `Second monster **${monster2Name}** not found. Please select one from the list!`,
          flags: MessageFlags.Ephemeral,
        });
      }
      if (monster2.id === monsterId) {
        return interaction.reply({
          content: `The second monster must be different from the first! Use \`type: Both Crowns\` to add both crowns for the same monster.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const pairId = (types.length > 1 || monster2) ? crypto.randomUUID() : null;

    let investigationId = null;
    let investigationLine = "";

    if (quest === "Investigation Quests" || quest === "Field Survey Quests") {
      let invMonster = monster;

      if (hostMonsterInput) {
        const resolved = await resolveMonsterName(hostMonsterInput);
        if (!resolved) {
          return interaction.reply({
            content: `Host monster **${hostMonsterInput}** not found. Please select one from the list!`,
            flags: MessageFlags.Ephemeral,
          });
        }
        invMonster = resolved;
      }

      const invMonsterName = invMonster.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      if (quest === "Field Survey Quests") {
        if (invMonster.id !== monsterId) {
          const invRes = await db.execute({
            sql: "INSERT INTO investigations (user_id, monster_id, remaining_uses) VALUES (?, ?, NULL)",
            args: [userId, invMonster.id],
          });
          investigationId = Number(invRes.lastInsertRowid);
          investigationLine = `**Field Survey:** ${invMonsterName}'s quest`;
        }
      } else {
        if (usesInput) {
          const invRes = await db.execute({
            sql: "INSERT INTO investigations (user_id, monster_id, remaining_uses) VALUES (?, ?, ?)",
            args: [userId, invMonster.id, usesInput],
          });
          investigationId = Number(invRes.lastInsertRowid);
          investigationLine = `**Investigation:** ${invMonsterName} (${usesInput} use${usesInput !== 1 ? "s" : ""})`;
        } else {
          const existingRes = await db.execute({
            sql: "SELECT id, remaining_uses FROM investigations WHERE user_id = ? AND monster_id = ? AND remaining_uses IS NOT NULL ORDER BY id DESC LIMIT 1",
            args: [userId, invMonster.id],
          });

          if (existingRes.rows.length > 0) {
            const existing = existingRes.rows[0];
            investigationId = existing.id;
            investigationLine = `**Investigation:** ${invMonsterName} *(linked to existing, ${existing.remaining_uses} use${existing.remaining_uses !== 1 ? "s" : ""} left)*`;
          } else {
            const invRes = await db.execute({
              sql: "INSERT INTO investigations (user_id, monster_id, remaining_uses) VALUES (?, ?, ?)",
              args: [userId, invMonster.id, 3],
            });
            investigationId = Number(invRes.lastInsertRowid);
            investigationLine = `**Investigation:** ${invMonsterName} (3 uses)`;
          }
        }
      }
    }

    const addedCrownsDesc = [];

    for (const type of types) {
      let currentTempered = tempered;
      let currentStrength = strength;

      if (type === "large" && typeInput === "both") {
        currentTempered = temperedLarge !== null ? temperedLarge : tempered;
        currentStrength = strengthLarge !== null ? strengthLarge : strength;
      }

      await db.execute({
        sql: `
          INSERT INTO crowns(user_id, monster_id, type, tempered, strength_rating, quest, remaining_uses, investigation_id, pair_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [userId, monsterId, type, currentTempered ? 1 : 0, currentStrength, quest, null, investigationId, pairId],
      });

      const icon = type === "small" ? E.smallCrown : E.largeCrown;
      const tLabel = type === "small" ? "Small" : "Large";
      addedCrownsDesc.push(`- ${icon} **${tLabel}** (${currentStrength}★${currentTempered ? " Tempered" : ""})`);
    }

    let monster2Desc = [];
    if (monster2 && type2Input) {
      const types2 = type2Input === "both" ? ["small", "large"] : [type2Input];
      const m2DisplayName = formatMonsterName(monster2.name, tempered2);
      const m2Emoji = monster2.emoji || "🐉";
      for (const type of types2) {
        const t2 = tempered2 ? 1 : 0;
        const s2 = strength2 || 1;
        await db.execute({
          sql: `
            INSERT INTO crowns(user_id, monster_id, type, tempered, strength_rating, quest, remaining_uses, investigation_id, pair_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [userId, monster2.id, type, t2, s2, quest, null, investigationId, pairId],
        });
        const icon = type === "small" ? E.smallCrown : E.largeCrown;
        const tLabel = type === "small" ? "Small" : "Large";
        monster2Desc.push(`- ${icon} **${tLabel}** (${s2}★${tempered2 ? " Tempered" : ""})`);
      }
      monster2Desc = [`\n${m2Emoji} **${m2DisplayName}**:`, ...monster2Desc];
    }

    const descLines = [
      `Successfully recorded the following for **${displayName}**:`,
      ...addedCrownsDesc,
      ...monster2Desc,
      "",
      `**Quest:** ${quest}`,
    ];
    if (investigationLine) descLines.push(investigationLine);
    if (monster2) descLines.push(`> Same-quest pairing recorded — both monsters are linked!`);

    const embed = new EmbedBuilder()
      .setTitle(`${monsterEmoji} Crown Added!`)
      .setDescription(descLines.join("\n"))
      .setColor(0x57f287)
      .setTimestamp();

    if (interaction.client.pusher) {
      interaction.client.pusher.trigger("public-channel", "crown_update", {});
    }

    if (monster.image_name) {
      embed.setThumbnail(`${WEB_BASE_URL}/monsters/${monster.image_name}`);
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
