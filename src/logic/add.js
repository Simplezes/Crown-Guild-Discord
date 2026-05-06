import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import db from "../database.js";
import { handleMonsterAutocomplete, resolveMonsterName, capitalize, formatMonsterName } from "../utils.js";
import { E } from "../emojis.js";
import crypto from "crypto";

const WEB_BASE_URL = process.env.WEB_HUB_URL;
const SESSION_TTL_MS = 15 * 60 * 1000;
const addSessions = new Map();

const QUEST_OPTIONS = [
  "Event Quests",
  "Optional Quests",
  "Field Survey Quests",
  "Investigation Quests",
];

function cid(sessionId, action) {
  return `crownadd:${sessionId}:${action}`;
}

function modalId(sessionId, action) {
  return `crownaddmodal:${sessionId}:${action}`;
}

function getTypes(typeInput) {
  if (typeInput === "both") return ["small", "large"];
  return [typeInput];
}

function getTypeState(session, type) {
  return type === "small" ? session.data.small : session.data.large;
}

function parseComponentId(customId) {
  const parts = customId.split(":");
  if (parts.length < 3) return null;
  return { prefix: parts[0], sessionId: parts[1], action: parts[2] };
}

function isSessionExpired(session) {
  return Date.now() - session.createdAt > SESSION_TTL_MS;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of addSessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) addSessions.delete(sessionId);
  }
}

function buildConfigEmbed(session) {
  const { monster } = session;
  const { type, quest, small, large, editTarget, hostMonsterName, investigationUses } = session.data;
  const types = getTypes(type);

  const lines = [
    `Configure your entry for **${formatMonsterName(monster.name, false)}**.`,
    "",
    `**Type:** ${type === "both" ? "Both Crowns" : type === "small" ? "Small Crown" : "Large Crown"}`,
    `**Quest:** ${quest}`,
    "",
    `**Editing:** ${editTarget === "small" ? "Small Crown" : "Large Crown"}`,
    `> ${E.smallCrown} Small: ${small.strength}★${small.tempered ? " • Tempered" : " • Normal"}`,
    `> ${E.largeCrown} Large: ${large.strength}★${large.tempered ? " • Tempered" : " • Normal"}`,
  ];

  if (types.length === 1) {
    const only = types[0] === "small" ? small : large;
    lines.push("", `Only **${types[0] === "small" ? "Small" : "Large"}** will be saved with these settings.`);
    lines.push(`Current: ${only.strength}★${only.tempered ? " Tempered" : " Normal"}`);
  }

  lines.push("", `**Host Monster:** ${hostMonsterName ? formatMonsterName(hostMonsterName, false) : "Same as target monster"}`);
  if (quest === "Investigation Quests") {
    lines.push(`**Investigation Uses:** ${investigationUses ? `${investigationUses} use${investigationUses !== 1 ? "s" : ""}` : "Auto (reuse latest or create 3-use)"}`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`${monster.emoji || "🐉"} Crown Add Configurator`)
    .setDescription(lines.join("\n"))
    .setColor(0xC4982A)
    .setFooter({ text: "Use dropdowns and buttons, then submit." })
    .setTimestamp();

  if (monster.image_name) {
    embed.setThumbnail(`${WEB_BASE_URL}/monsters/${monster.image_name}`);
  }
  return embed;
}

function buildComponents(session) {
  const rows = [];
  const { type, quest, editTarget } = session.data;

  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId(cid(session.sessionId, "set_type"))
    .setPlaceholder("Choose crown type")
    .addOptions([
      { label: "Small Crown", value: "small", default: type === "small" },
      { label: "Large Crown", value: "large", default: type === "large" },
      { label: "Both Crowns", value: "both", default: type === "both" },
    ]);
  rows.push(new ActionRowBuilder().addComponents(typeSelect));

  const questSelect = new StringSelectMenuBuilder()
    .setCustomId(cid(session.sessionId, "set_quest"))
    .setPlaceholder("Choose quest type")
    .addOptions(
      QUEST_OPTIONS.map((q) => ({
        label: q,
        value: q,
        default: q === quest,
      }))
    );
  rows.push(new ActionRowBuilder().addComponents(questSelect));

  const currentStrength = getTypeState(session, editTarget).strength;
  const strengthSelect = new StringSelectMenuBuilder()
    .setCustomId(cid(session.sessionId, "set_strength"))
    .setPlaceholder(`Set ${editTarget === "small" ? "Small" : "Large"} crown strength`)
    .addOptions(
      Array.from({ length: 10 }, (_, i) => {
        const value = String(i + 1);
        return { label: `${i + 1}★`, value, default: Number(value) === currentStrength };
      })
    );
  rows.push(new ActionRowBuilder().addComponents(strengthSelect));

  const typeButtons = [
    new ButtonBuilder()
      .setCustomId(cid(session.sessionId, "toggle_tempered"))
      .setLabel(getTypeState(session, editTarget).tempered ? `Tempered: On (${editTarget})` : `Tempered: Off (${editTarget})`)
      .setStyle(getTypeState(session, editTarget).tempered ? ButtonStyle.Success : ButtonStyle.Secondary),
  ];

  if (type === "both") {
    typeButtons.push(
      new ButtonBuilder()
        .setCustomId(cid(session.sessionId, "switch_target"))
        .setLabel(`Switch to ${editTarget === "small" ? "Large" : "Small"}`)
        .setStyle(ButtonStyle.Primary)
    );
  }

  rows.push(new ActionRowBuilder().addComponents(typeButtons));

  const controls = [
    new ButtonBuilder()
      .setCustomId(cid(session.sessionId, "set_host"))
      .setLabel("Host Monster")
      .setStyle(ButtonStyle.Secondary),
  ];

  if (quest === "Investigation Quests") {
    controls.push(
      new ButtonBuilder()
        .setCustomId(cid(session.sessionId, "set_uses"))
        .setLabel("Investigation Uses")
        .setStyle(ButtonStyle.Secondary)
    );
  }
  controls.push(
    new ButtonBuilder().setCustomId(cid(session.sessionId, "submit")).setLabel("Submit").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(cid(session.sessionId, "cancel")).setLabel("Cancel").setStyle(ButtonStyle.Danger)
  );
  rows.push(new ActionRowBuilder().addComponents(controls.slice(0, 5)));

  return rows;
}

async function saveCrownEntry(interaction, session) {
  const userId = interaction.user.id;
  const { monster } = session;
  const { type, small, large, quest, hostMonsterName, investigationUses } = session.data;
  const types = getTypes(type);

  await db.execute({
    sql: "INSERT OR IGNORE INTO users(id) VALUES (?)",
    args: [userId],
  });

  let investigationId = null;
  let investigationLine = "";

  if (quest === "Investigation Quests" || quest === "Field Survey Quests") {
    let invMonster = monster;
    if (hostMonsterName) {
      const resolved = await resolveMonsterName(hostMonsterName.toLowerCase().trim());
      if (!resolved) {
        return {
          error: `Host monster **${hostMonsterName}** was not found. Please try again with a valid monster name.`,
        };
      }
      invMonster = resolved;
    }

    const invMonsterName = invMonster.name.split(" ").map((w) => capitalize(w)).join(" ");

    if (quest === "Field Survey Quests") {
      if (invMonster.id !== monster.id) {
        const invRes = await db.execute({
          sql: "INSERT INTO investigations (user_id, monster_id, remaining_uses) VALUES (?, ?, NULL)",
          args: [userId, invMonster.id],
        });
        investigationId = Number(invRes.lastInsertRowid);
        investigationLine = `**Field Survey:** ${invMonsterName}'s quest`;
      }
    } else if (investigationUses) {
      const invRes = await db.execute({
        sql: "INSERT INTO investigations (user_id, monster_id, remaining_uses) VALUES (?, ?, ?)",
        args: [userId, invMonster.id, investigationUses],
      });
      investigationId = Number(invRes.lastInsertRowid);
      investigationLine = `**Investigation:** ${invMonsterName} (${investigationUses} use${investigationUses !== 1 ? "s" : ""})`;
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

  const pairId = types.length > 1 ? crypto.randomUUID() : null;
  const addedCrownsDesc = [];

  for (const t of types) {
    const tState = t === "small" ? small : large;
    await db.execute({
      sql: `
        INSERT INTO crowns(user_id, monster_id, type, tempered, strength_rating, quest, remaining_uses, investigation_id, pair_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [userId, monster.id, t, tState.tempered ? 1 : 0, tState.strength, quest, null, investigationId, pairId],
    });

    const icon = t === "small" ? E.smallCrown : E.largeCrown;
    const tLabel = t === "small" ? "Small" : "Large";
    addedCrownsDesc.push(`- ${icon} **${tLabel}** (${tState.strength}★${tState.tempered ? " Tempered" : ""})`);
  }

  const lines = [
    `Successfully recorded the following for **${formatMonsterName(monster.name, false)}**:`,
    ...addedCrownsDesc,
    "",
    `**Quest:** ${quest}`,
  ];
  if (hostMonsterName) lines.push(`**Host Monster:** ${formatMonsterName(hostMonsterName, false)}`);
  if (investigationLine) lines.push(investigationLine);

  const embed = new EmbedBuilder()
    .setTitle(`${monster.emoji || "🐉"} Crown Added!`)
    .setDescription(lines.join("\n"))
    .setColor(0x57f287)
    .setTimestamp();

  if (interaction.client.pusher) {
    interaction.client.pusher.trigger("public-channel", "crown_update", {});
  }

  if (monster.image_name) {
    embed.setThumbnail(`${WEB_BASE_URL}/monsters/${monster.image_name}`);
  }

  return { embed };
}

export default {
  async autocomplete(interaction) {
    await handleMonsterAutocomplete(interaction);
  },
  async execute(interaction) {
    cleanupExpiredSessions();
    const monsterName = interaction.options.getString("monster")?.toLowerCase().trim();
    const monster = await resolveMonsterName(monsterName);
    if (!monster) {
      return interaction.reply({
        content: `Monster **${monsterName}** not found. Please select one from the list!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const sessionId = crypto.randomUUID();
    const session = {
      sessionId,
      userId: interaction.user.id,
      createdAt: Date.now(),
      monster,
      data: {
        type: "small",
        quest: "Optional Quests",
        small: { tempered: false, strength: 1 },
        large: { tempered: false, strength: 1 },
        editTarget: "small",
        hostMonsterName: null,
        investigationUses: null,
      },
    };

    addSessions.set(sessionId, session);

    return interaction.reply({
      embeds: [buildConfigEmbed(session)],
      components: buildComponents(session),
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleComponent(interaction) {
    const parsed = parseComponentId(interaction.customId);
    if (!parsed || parsed.prefix !== "crownadd") return false;

    const session = addSessions.get(parsed.sessionId);
    if (!session || isSessionExpired(session)) {
      addSessions.delete(parsed.sessionId);
      const msg = "This crown setup has expired. Please run `/crown add` again.";
      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        }
      }
      return true;
    }

    if (interaction.user.id !== session.userId) {
      await interaction.reply({
        content: "Only the hunter who opened this setup can use these controls.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const action = parsed.action;

    if (interaction.isStringSelectMenu()) {
      const value = interaction.values?.[0];
      if (action === "set_type") {
        session.data.type = value;
        if (value === "small") session.data.editTarget = "small";
        if (value === "large") session.data.editTarget = "large";
      } else if (action === "set_quest") {
        session.data.quest = value;
      } else if (action === "set_strength") {
        const num = Number(value);
        if (!Number.isNaN(num) && num >= 1 && num <= 10) {
          const tState = getTypeState(session, session.data.editTarget);
          tState.strength = num;
        }
      }

      addSessions.set(session.sessionId, session);
      await interaction.update({ embeds: [buildConfigEmbed(session)], components: buildComponents(session) });
      return true;
    }

    if (!interaction.isButton()) return false;

    if (action === "toggle_tempered") {
      const tState = getTypeState(session, session.data.editTarget);
      tState.tempered = !tState.tempered;
      addSessions.set(session.sessionId, session);
      await interaction.update({ embeds: [buildConfigEmbed(session)], components: buildComponents(session) });
      return true;
    }

    if (action === "switch_target") {
      session.data.editTarget = session.data.editTarget === "small" ? "large" : "small";
      addSessions.set(session.sessionId, session);
      await interaction.update({ embeds: [buildConfigEmbed(session)], components: buildComponents(session) });
      return true;
    }

    if (action === "set_host") {
      const modal = new ModalBuilder()
        .setCustomId(modalId(session.sessionId, "host"))
        .setTitle("Set Host Monster")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("host_monster")
              .setLabel("Host monster name")
              .setPlaceholder("Example: Rathalos (leave blank to reset)")
              .setRequired(false)
              .setStyle(TextInputStyle.Short)
          )
        );
      await interaction.showModal(modal);
      return true;
    }

    if (action === "set_uses") {
      const modal = new ModalBuilder()
        .setCustomId(modalId(session.sessionId, "uses"))
        .setTitle("Set Investigation Uses")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("uses")
              .setLabel("Uses (1-3)")
              .setPlaceholder("Leave blank for auto")
              .setRequired(false)
              .setStyle(TextInputStyle.Short)
          )
        );
      await interaction.showModal(modal);
      return true;
    }

    if (action === "cancel") {
      addSessions.delete(session.sessionId);
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("Cancelled")
            .setDescription("Crown entry was cancelled.")
            .setColor(0x95A5A6),
        ],
        components: [],
      });
      return true;
    }

    if (action === "submit") {
      const result = await saveCrownEntry(interaction, session);
      addSessions.delete(session.sessionId);

      if (result.error) {
        await interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
        return true;
      }

      await interaction.update({ embeds: [result.embed], components: [] });
      return true;
    }

    return false;
  },

  async handleModalSubmit(interaction) {
    const parsed = parseComponentId(interaction.customId.replace("crownaddmodal:", "crownadd:"));
    if (!parsed || parsed.prefix !== "crownadd") return false;

    const session = addSessions.get(parsed.sessionId);
    if (!session || isSessionExpired(session)) {
      addSessions.delete(parsed.sessionId);
      await interaction.reply({
        content: "This crown setup has expired. Please run `/crown add` again.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (interaction.user.id !== session.userId) {
      await interaction.reply({
        content: "Only the hunter who opened this setup can use these controls.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (parsed.action === "host") {
      const input = interaction.fields.getTextInputValue("host_monster")?.trim();
      if (!input) {
        session.data.hostMonsterName = null;
        addSessions.set(session.sessionId, session);
        await interaction.reply({ content: "Host monster reset to target monster.", flags: MessageFlags.Ephemeral });
        return true;
      }

      session.data.hostMonsterName = input;
      addSessions.set(session.sessionId, session);
      await interaction.reply({
        content: `Host monster set to **${input}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (parsed.action === "uses") {
      const raw = interaction.fields.getTextInputValue("uses")?.trim();
      if (!raw) {
        session.data.investigationUses = null;
        addSessions.set(session.sessionId, session);
        await interaction.reply({ content: "Uses reset to auto mode.", flags: MessageFlags.Ephemeral });
        return true;
      }

      const uses = Number(raw);
      if (![1, 2, 3].includes(uses)) {
        await interaction.reply({ content: "Uses must be 1, 2, or 3.", flags: MessageFlags.Ephemeral });
        return true;
      }

      session.data.investigationUses = uses;
      addSessions.set(session.sessionId, session);
      await interaction.reply({ content: `Investigation uses set to **${uses}**.`, flags: MessageFlags.Ephemeral });
      return true;
    }

    return false;
  },
};
