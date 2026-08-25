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

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ONLINE_EMBED_COLOR = 0x5865F2;

function generateCode(length = 6) {
    let out = '';
    for (let i = 0; i < length; i++) {
        out += LINK_CODE_ALPHABET[Math.floor(Math.random() * LINK_CODE_ALPHABET.length)];
    }
    return out;
}

function formatDate(d = new Date()) {
    const formatter = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    return formatter.format(d).replace(', ', ' ');
}

function createDiscordBot({
    token,
    guildId,
    roleIds,
    channelIds,
    db,
    t
}) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers
        ]
    });

    /*
     * Set once main() has launched both rooms (see src/index.js). Calling
     * a ban/mute/unban/unmute/password slash-command before rooms are up
     * is still safe: the DB/state write always happens regardless, these
     * bridges are only for applying an *instant* live effect on top of
     * that. Until they're set, the relevant commands silently skip the
     * live-effect step (moderation) or report the room as unavailable
     * (password, which has no durable-only fallback since the password
     * itself lives only in browser-side state).
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
        applyModeration: (action) => (applyModeration ? applyModeration(action) : Promise.resolve(false)),
        applyToRoom: (roomType, action) => (applyToRoom ? applyToRoom(roomType, action) : Promise.resolve(false)),
        discordBotSend: {
            sendReport: (...args) => sendReport(...args),
            sendStatsBackup: (...args) => sendStatsBackup(...args)
        },
        t
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

    async function sendAnalyticsDailyReport(dayKey, report) {
        if (!channelIds.analytics) return false;

        const channel = await client.channels.fetch(channelIds.analytics).catch(() => null);
        if (!channel) return false;

        const fmt = (value) => {
            const num = Number(value ?? 0);
            return Number.isFinite(num) ? num.toFixed(2) : '0.00';
        };

        const content = [
            t('discordBot.analyticsDaily.header', { day: dayKey }),
            t('discordBot.analyticsDaily.online', { peak: report.onlinePeak, avg: fmt(report.onlineAvg) }),
            t('discordBot.analyticsDaily.joins', { total: report.joinsTotal, unique: report.joinsUnique }),
            t('discordBot.analyticsDaily.players', { newPlayers: report.newPlayers, returningPlayers: report.returningPlayers }),
            t('discordBot.analyticsDaily.sessions', { started: report.sessionsStarted, finished: report.sessionsFinished, avgSec: fmt(report.avgSessionSec) }),
            t('discordBot.analyticsDaily.matches', { started: report.matchesStarted, finished: report.matchesFinished, avgSec: fmt(report.avgMatchSec) })
        ].join('\n');

        await channel.send({ content: truncate(content) }).catch(() => {});
        return true;
    }

    async function editOnlineMessage(channelId, messageId, payload) {
        if (!channelId || !messageId || !payload) return;
        try {
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);

            const { title, playersLine, count, maxPlayers, roomLink } = payload;

            const embed = new EmbedBuilder()
                .setColor(ONLINE_EMBED_COLOR)
                .setTitle(`${title} - ${count}/${maxPlayers}`)
                .addFields({ name: t('discordBot.onlineEmbed.playersField'), value: playersLine || '' })
                .setFooter({ text: t('discordBot.onlineEmbed.footer', { date: formatDate() }) });

            const components = [];
            if (roomLink) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel(t('discordBot.onlineEmbed.joinButton'))
                        .setStyle(ButtonStyle.Link)
                        .setURL(roomLink)
                );
                components.push(row);
            }

            await message.edit({ content: '', embeds: [embed], components });
        } catch (err) {
            console.error('[Discord] editOnlineMessage failed:', err);
        }
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
        editOnlineMessage,
        setModerationBridge,
        setRoomActionBridge
    };
}

module.exports = { createDiscordBot };