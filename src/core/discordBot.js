const fs = require('node:fs');
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    AttachmentBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const createDiscordCommands = require('./discordCommands');
const { buildAnalyticsChart } = require('./utils/analyticsChart');

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ONLINE_EMBED_COLOR = 0x5865F2;
const ANALYTICS_EMBED_COLOR = 0x57F287;

function generateCode(length = 6) {
    let out = '';
    for (let i = 0; i < length; i++) {
        out += LINK_CODE_ALPHABET[Math.floor(Math.random() * LINK_CODE_ALPHABET.length)];
    }
    return out;
}

/*
 * No-op stand-in used when DISCORD_BOT_TOKEN is empty. Mirrors the full
 * public interface returned by createDiscordBot(...) below, so every
 * caller (src/index.js's main(), launchRoom's __discordCall dispatch,
 * the browser-side DiscordBot bridge in src/core/utils/discord.js,
 * intervals.js, etc.) keeps working completely unchanged whether or not
 * Discord is configured.
 *
 * Every method here is a silent, safe no-op instead of touching an
 * unauthenticated discord.js Client — which is what used to happen
 * (client.channels.fetch(...) etc. against a client that never logged
 * in), spamming the console with fetch/login errors on every send.
 * Return shapes intentionally match the existing "unavailable"/failure
 * branches already handled elsewhere (e.g. src/core/utils/discord.js's
 * `{ ok: false, reason: 'unavailable' }`, or a falsy return meaning "no
 * live effect applied" in discordCommands.js / the room bridge).
 */
function createDisabledDiscordBot() {
    return {
        login: async () => {},
        destroy: () => {},
        consumeLinkCode: async () => ({ ok: false, reason: 'unavailable' }),
        unlinkByAuth: async () => ({ ok: false, reason: 'unavailable' }),
        syncRoleForAuth: async () => {},
        getDiscordUsername: async () => null,
        sendLog: async () => {},
        sendReport: async () => {},
        sendRecording: async () => {},
        sendVipPassword: async () => {},
        sendStatsBackup: async () => {},
        sendAnalyticsDailyReport: async () => false,
        registerRooms: () => {},
        editOnlineMessage: async () => {},
        setModerationBridge: () => {},
        setRoomActionBridge: () => {}
    };
}

function createDiscordBot({
    token,
    guildId,
    roleIds,
    channelIds,
    db,
    timeFormat,
    t,
    maxPlayersByCategory = {},
    roomChoices = [],
    roomCategories = []
}) {
    if (!token) {
        return createDisabledDiscordBot();
    }

    const { formatDate } = timeFormat;

    const categoryLabelByCategory = new Map(
        roomCategories.map(category => [category, category.toUpperCase()])
    );

    function categoryLabel(roomCategory) {
        return categoryLabelByCategory.get(roomCategory) ?? String(roomCategory ?? '').toUpperCase();
    }

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers
        ]
    });

    /*
     * Set once main() has launched all configured rooms (see
     * src/index.js). Calling a ban/mute/unban/unmute/password
     * slash-command before rooms are up is still safe: the DB/state
     * write always happens regardless, these bridges are only for
     * applying an *instant* live effect on top of that. Until they're
     * set, the relevant commands silently skip the live-effect step
     * (moderation) or report the room as unavailable (password, which
     * has no durable-only fallback since the password itself lives only
     * in browser-side state).
     */
    let applyModeration = null;
    let applyToRoom = null;

    function setModerationBridge(fn) {
        applyModeration = fn;
    }

    function setRoomActionBridge(fn) {
        applyToRoom = fn;
    }

    const roomCommands = createDiscordCommands({
        db,
        timeFormat,
        applyModeration: (action) => (applyModeration ? applyModeration(action) : Promise.resolve(false)),
        applyToRoom: (roomKey, action) => (applyToRoom ? applyToRoom(roomKey, action) : Promise.resolve(false)),
        discordBotSend: {
            sendReport: (...args) => sendReport(...args),
            sendStatsBackup: (...args) => sendStatsBackup(...args)
        },
        t,
        maxPlayersByCategory,
        roomChoices,
        roomCategories
    });

    const pendingLinkCodes = new Map();

    function cleanupExpiredCodes() {
        const now = Date.now();
        for (const [code, entry] of pendingLinkCodes) {
            if (entry.expiresAt <= now) pendingLinkCodes.delete(code);
        }
    }

    function createLinkCode(discordId) {
        cleanupExpiredCodes();
        for (const [code, entry] of pendingLinkCodes) {
            if (entry.discordId === discordId) pendingLinkCodes.delete(code);
        }

        let code;
        do {
            code = generateCode();
        } while (pendingLinkCodes.has(code));

        pendingLinkCodes.set(code, { discordId, expiresAt: Date.now() + LINK_CODE_TTL_MS });
        return code;
    }

    async function consumeLinkCode(code, auth) {
        cleanupExpiredCodes();
        const entry = pendingLinkCodes.get(code.toUpperCase());
        if (!entry) return { ok: false, reason: 'invalid' };

        const account = await db.getAccount(auth);
        if (!account) return { ok: false, reason: 'unknown_account' };

        if (account.discord) {
            return { ok: false, reason: 'already_linked' };
        }

        const existing = await db.getAccountByDiscordId(entry.discordId);
        if (existing && existing.auth !== auth) {
            return { ok: false, reason: 'already_linked_elsewhere' };
        }

        pendingLinkCodes.delete(code.toUpperCase());

        await db.setDiscordId(auth, entry.discordId);
        await syncRoleForAuth(auth);
        return { ok: true };
    }

    const MANAGED_ROLE_NAMES = ['vip', 'preadmin', 'admin', 'master'];

    async function getGuild() {
        return client.guilds.fetch(guildId);
    }

    async function syncRoleForAuth(auth) {
        try {
            const account = await db.getAccount(auth);
            if (!account || !account.discord) return;

            const guild = await getGuild();
            const member = await guild.members.fetch({ user: account.discord, force: true }).catch(() => null);
            if (!member) return;

            const allManagedRoleIds = MANAGED_ROLE_NAMES.map(name => roleIds[name]).filter(Boolean);
            const targetRoleId = MANAGED_ROLE_NAMES.includes(account.role) ? roleIds[account.role] : null;

            const toRemove = allManagedRoleIds.filter(
                id => id !== targetRoleId && member.roles.cache.has(id)
            );
            for (const id of toRemove) {
                await member.roles.remove(id).catch(() => {});
            }

            if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
                await member.roles.add(targetRoleId).catch(() => {});
            }
        } catch (err) {
            console.error('[Discord] syncRoleForAuth failed:', err);
        }
    }

    async function removeAllManagedRoles(discordId) {
        try {
            const guild = await getGuild();
            const member = await guild.members.fetch({ user: discordId, force: true }).catch(() => null);
            if (!member) return;

            const allManagedRoleIds = MANAGED_ROLE_NAMES.map(name => roleIds[name]).filter(Boolean);
            const toRemove = allManagedRoleIds.filter(id => member.roles.cache.has(id));

            for (const id of toRemove) {
                await member.roles.remove(id).catch(() => {});
            }
        } catch (err) {
            console.error('[Discord] removeAllManagedRoles failed:', err);
        }
    }

    async function unlinkByAuth(auth) {
        const account = await db.getAccount(auth);
        if (!account || !account.discord) return { ok: false, reason: 'not_linked' };

        const discordId = account.discord;
        await db.setDiscordId(auth, null);
        await removeAllManagedRoles(discordId);
        return { ok: true };
    }

    async function unlinkByDiscordId(discordId) {
        const account = await db.getAccountByDiscordId(discordId);
        if (!account) return { ok: false, reason: 'not_linked' };

        await db.setDiscordId(account.auth, null);
        await removeAllManagedRoles(discordId);
        return { ok: true, auth: account.auth };
    }

    async function getDiscordUsername(discordId) {
        if (!discordId) return null;
        try {
            const user = await client.users.fetch(discordId);
            return user?.username ?? null;
        } catch (err) {
            return null;
        }
    }

    function truncate(str, max = 1900) {
        return str.length > max ? str.slice(0, max - 1) + '…' : str;
    }

    async function sendLog(roomLabel, content) {
        if (!channelIds.log) return;
        const channel = await client.channels.fetch(channelIds.log).catch(() => null);
        if (channel) {
            const prefix = roomLabel ? `\`[${roomLabel}]\` ` : '';
            await channel.send({ content: truncate(`${prefix}${content}`) }).catch(() => {});
        }
    }

    async function sendReport(roomLabel, adminName, toPlayerName, action, reason, time) {
        if (!channelIds.report) return;
        const actions = {
            mute: t('discordBot.report.mute'),
            ban: t('discordBot.report.ban'),
            unmute: t('discordBot.report.unmute'),
            unban: t('discordBot.report.unban')
        };
        const channel = await client.channels.fetch(channelIds.report).catch(() => null);
        if (!channel) return;

        const prefix = roomLabel ? `\`[${roomLabel}]\` ` : '';
        const content = t('discordBot.report.line', {
            prefix,
            admin: adminName,
            action: actions[action],
            target: toPlayerName,
            time: time != null ? t('discordBot.report.timeSuffix', { time }) : '',
            reason: reason != null ? t('discordBot.report.reasonSuffix', { reason }) : ''
        });

        await channel.send({ content: truncate(content) }).catch(() => {});
    }

    async function sendRecording(roomLabel, recBytes, name, id) {
        if (!channelIds.replay) return;
        const channel = await client.channels.fetch(channelIds.replay).catch(() => null);
        if (!channel) return;

        try {
            const prefix = roomLabel ? `\`[${roomLabel}]\` ` : '';
            const buffer = Buffer.from(recBytes, 'base64');
            const file = new AttachmentBuilder(buffer, { name });

            await channel.send({
                content: `${prefix}\`№ ${id}\``,
                files: [file]
            });
        } catch (err) {
            console.error('[Discord] sendRecording failed:', err);
        }
    }

    async function sendVipPassword(roomLabel, vipPassword) {
        if (!channelIds.vip) return;
        const channel = await client.channels.fetch(channelIds.vip).catch(() => null);
        if (channel) {
            const prefix = roomLabel ? `\`[${roomLabel}]\` ` : '';
            await channel.send({
                content: t('discordBot.vipPasswordHeader', { prefix, password: vipPassword })
            }).catch(() => {});
        }
    }

    /*
     * Sends a stats backup file (already written to disk on the Node side
     * by db.backupStats()) into the log channel as an attachment. filePath
     * is a local path on the Node filesystem — only ever produced by
     * db.backupStats(), never by the browser context, so this is safe to
     * read directly.
     */
    async function sendStatsBackup(roomLabel, filePath, filename) {
        if (!channelIds.log) return;
        const channel = await client.channels.fetch(channelIds.log).catch(() => null);
        if (!channel) return;

        try {
            const prefix = roomLabel ? `\`[${roomLabel}]\` ` : '';
            const buffer = fs.readFileSync(filePath);
            const file = new AttachmentBuilder(buffer, { name: filename });

            await channel.send({
                content: t('discordBot.statsBackupUploaded', { prefix }),
                files: [file]
            });
        } catch (err) {
            console.error('[Discord] sendStatsBackup failed:', err);
        }
    }

    function resolveOnlineMax(roomCategory) {
        const value = maxPlayersByCategory?.[roomCategory];
        return Number.isFinite(value) && value > 0 ? value : undefined;
    }

    async function tryBuildDailyChartBuffer(dayKey, roomCategory) {
        try {
            return await buildAnalyticsChart({
                db,
                period: 'today',
                fromDayKey: dayKey,
                toDayKey: dayKey,
                roomCategory,
                roomCategoryLabel: categoryLabel(roomCategory),
                timeFormat,
                interval: '1h',
                onlineMax: resolveOnlineMax(roomCategory)
            });
        } catch (err) {
            console.error('[Discord] Failed to build analytics chart:', err);
            return null;
        }
    }

    async function sendAnalyticsDailyReport(dayKey, roomCategory, report) {
        if (!channelIds.analytics) return false;

        const channel = await client.channels.fetch(channelIds.analytics).catch(() => null);
        if (!channel) return false;

        const categoryLabelValue = categoryLabel(roomCategory);

        const fmtSec = (value) => {
            const totalSec = Math.round(Number(value ?? 0));
            const mins = Math.floor(totalSec / 60);
            const secs = totalSec % 60;
            return t('discordBot.analyticsDaily.durationMinSec', { mins, secs });
        };

        const retentionPct = report.joinsUnique > 0
            ? Math.round((report.returningPlayers / report.joinsUnique) * 100)
            : 0;

        const fullMatchPct = report.matchesTotal > 0
            ? Math.round((report.matchesFull / report.matchesTotal) * 100)
            : 0;

        const embed = new EmbedBuilder()
            .setColor(ANALYTICS_EMBED_COLOR)
            .setTitle(t('discordBot.analyticsDaily.title', { category: categoryLabelValue }))
            .setDescription(t('discordBot.analyticsDaily.description', { day: dayKey }))
            .addFields(
                {
                    name: t('discordBot.analyticsDaily.fields.online'),
                    value: t('discordBot.analyticsDaily.values.online', {
                        peak: report.onlinePeak,
                        avg: Number(report.onlineAvg ?? 0).toFixed(1)
                    })
                },
                {
                    name: t('discordBot.analyticsDaily.fields.joins'),
                    value: t('discordBot.analyticsDaily.values.joins', {
                        total: report.joinsTotal,
                        unique: report.joinsUnique
                    })
                },
                {
                    name: t('discordBot.analyticsDaily.fields.players'),
                    value: t('discordBot.analyticsDaily.values.players', {
                        newPlayers: report.newPlayers,
                        returningPlayers: report.returningPlayers,
                        retentionPct
                    })
                },
                {
                    name: t('discordBot.analyticsDaily.fields.avgSession'),
                    value: fmtSec(report.avgSessionSec)
                },
                {
                    name: t('discordBot.analyticsDaily.fields.matches'),
                    value: t('discordBot.analyticsDaily.values.matches', {
                        total: report.matchesTotal,
                        full: report.matchesFull,
                        fullPct: fullMatchPct
                    })
                },
                {
                    name: t('discordBot.analyticsDaily.fields.avgMatch'),
                    value: fmtSec(report.avgMatchSec)
                }
            )
            .setFooter({ text: t('discordBot.analyticsDaily.footer', { date: formatDate() }) });

        const files = [];
        const chartBuffer = await tryBuildDailyChartBuffer(dayKey, roomCategory);
        if (chartBuffer) {
            files.push(new AttachmentBuilder(chartBuffer, { name: 'analytics.png' }));
            embed.setImage('attachment://analytics.png');
        }

        await channel.send({ embeds: [embed], files }).catch(() => {});
        return true;
    }

    let onlineMessageId = null;
    let onlineRoomOrder = [];
    const onlinePayloadByKey = new Map();
    let onlineEditChain = Promise.resolve();

    function registerRooms(rooms) {
        onlineRoomOrder = rooms.map(r => ({ roomKey: r.roomKey, roomLabel: r.roomLabel }));
    }

    async function ensureOnlineMessages() {
        if (!channelIds.online || onlineRoomOrder.length === 0) return;

        const channel = await client.channels.fetch(channelIds.online).catch(() => null);
        if (!channel) {
            console.error('[Discord] DISCORD_ONLINE_CHANNEL_ID is set but the channel could not be fetched.');
            return;
        }

        onlineMessageId = db.getOnlineMessageId('online');

        if (onlineMessageId) {
            try {
                await channel.messages.fetch(onlineMessageId);
                console.log(`[Discord] Reused online-status message ${onlineMessageId}`);
                return;
            } catch (err) {
                if (err?.code === 10008) {
                    console.log('[Discord] Stored online-status message not found, will create a new one');
                    onlineMessageId = null;
                } else {
                    console.error('[Discord] Failed to fetch stored online-status message:', err);
                    return;
                }
            }
        }

        try {
            const embeds = onlineRoomOrder.map(({ roomKey, roomLabel }) =>
                new EmbedBuilder()
                    .setColor(ONLINE_EMBED_COLOR)
                    .setTitle(roomLabel)
                    .addFields({ name: '\u200B', value: `**${roomLabel}** — initializing...` })
            );

            const message = await channel.send({ content: '', embeds });
            onlineMessageId = message.id;
            db.setOnlineMessageId('online', message.id);
            console.log(`[Discord] Created online-status message ${message.id}`);
        } catch (err) {
            console.error('[Discord] Failed to create online-status message:', err);
        }
    }

    async function editOnlineMessage(roomKey, payload) {
        if (!channelIds.online || !payload) return;
        onlinePayloadByKey.set(roomKey, payload);

        if (!onlineMessageId) return;

        onlineEditChain = onlineEditChain.then(async () => {
            try {
                const channel = await client.channels.fetch(channelIds.online);
                const message = await channel.messages.fetch(onlineMessageId);

                const embeds = onlineRoomOrder.map(({ roomKey: rk, roomLabel }) => {
                    const p = onlinePayloadByKey.get(rk);
                    if (p) {
                        return new EmbedBuilder()
                            .setColor(ONLINE_EMBED_COLOR)
                            .setTitle(`${p.title} - ${p.count}/${p.maxPlayers}`)
                            .addFields({ name: t('discordBot.onlineEmbed.playersField'), value: p.playersLine || '' })
                            .setFooter({ text: t('discordBot.onlineEmbed.footer', { date: formatDate() }) });
                    }
                    return new EmbedBuilder()
                        .setColor(ONLINE_EMBED_COLOR)
                        .setTitle(roomLabel)
                        .addFields({ name: '\u200B', value: `**${roomLabel}** — waiting...` });
                });

                const components = [];
                for (const { roomKey: rk, roomLabel } of onlineRoomOrder) {
                    const p = onlinePayloadByKey.get(rk);
                    if (p?.roomLink) {
                        components.push(
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setLabel(`${t('discordBot.onlineEmbed.joinButton')} ${roomLabel}`)
                                    .setStyle(ButtonStyle.Link)
                                    .setURL(p.roomLink)
                            )
                        );
                    }
                }

                await message.edit({ content: '', embeds, components });
            } catch (err) {
                if (err?.code === 10008) {
                    console.log('[Discord] Online-status message was deleted, will recreate on next update');
                    onlineMessageId = null;
                } else {
                    console.error(`[Discord] editOnlineMessage(${roomKey}) failed:`, err);
                }
            }
        });
    }

    async function registerSlashCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('link')
                .setDescription(t('discord.command.link')),
            new SlashCommandBuilder()
                .setName('unlink')
                .setDescription(t('discord.command.unlink')),
            ...roomCommands.buildCommandDefinitions()
        ].map(c => (typeof c.toJSON === 'function' ? c.toJSON() : c));

        const rest = new REST({ version: '10' }).setToken(token);
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
    }

    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'link') {
            const existing = await db.getAccountByDiscordId(interaction.user.id);
            if (existing) {
                await interaction.reply({
                    content: t('discordBot.linkSlash.alreadyLinked'),
                    ephemeral: true
                });
                return;
            }

            const code = createLinkCode(interaction.user.id);

            await interaction.reply({
                content: t('discordBot.linkSlash.codeReply', { code }),
                ephemeral: true
            });
            return;
        }

        if (interaction.commandName === 'unlink') {
            const result = await unlinkByDiscordId(interaction.user.id);

            if (result.ok) {
                await interaction.reply({
                    content: t('discordBot.linkSlash.unlinked'),
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: t('discordBot.linkSlash.notLinked'),
                    ephemeral: true
                });
            }
            return;
        }

        await roomCommands.handleInteraction(interaction);
    });

    async function login() {
        await client.login(token);
        await new Promise(resolve => client.once('ready', resolve));
        await registerSlashCommands();
        console.log(`[Discord] Bot ready as ${client.user.tag}`);
    }

    function destroy() {
        client.destroy();
    }

    return {
        login,
        destroy,
        consumeLinkCode,
        unlinkByAuth,
        syncRoleForAuth,
        getDiscordUsername,
        sendLog,
        sendReport,
        sendRecording,
        sendVipPassword,
        sendStatsBackup,
        sendAnalyticsDailyReport,
        registerRooms,
        ensureOnlineMessages,
        editOnlineMessage,
        setModerationBridge,
        setRoomActionBridge
    };
}

module.exports = { createDiscordBot };