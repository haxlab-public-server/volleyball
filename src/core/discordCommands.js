const {
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

const Role = {
    PLAYER: 0,
    VIP: 1,
    PREADMIN: 2,
    ADMIN: 3,
    MASTER: 4
};

const RoleString = {
    player: Role.PLAYER,
    vip: Role.VIP,
    preadmin: Role.PREADMIN,
    admin: Role.ADMIN,
    master: Role.MASTER
};

const ROLE_LABELS = {
    [Role.MASTER]: 'MASTER',
    [Role.ADMIN]: 'ADMIN',
    [Role.PREADMIN]: 'PREADMIN',
    [Role.VIP]: 'VIP',
    [Role.PLAYER]: 'PLAYER'
};

const EMBED_COLOR = 0x5865F2;
const ERROR_COLOR = 0xE62C2C;
const BROADCAST_ROOM_LABEL = 'Room';

function parseTimeArg(str) {
    const coef = {
        s: 1000,
        min: 1000 * 60,
        h: 1000 * 60 * 60,
        d: 1000 * 60 * 60 * 24,
        w: 1000 * 60 * 60 * 24 * 7,
        mon: 1000 * 60 * 60 * 24 * 30
    };
    for (const unit of Object.keys(coef)) {
        if (str.includes(unit)) {
            const n = Number(str.replace(/[^\d]/g, ''));
            if (!Number.isFinite(n)) return null;
            return { ms: n * coef[unit], label: `${n}${unit}` };
        }
    }
    return null;
}

function isValidAuth(str) {
    return typeof str === 'string' && str.length === 43;
}

function errorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(ERROR_COLOR)
        .setTitle(`❌ ${title}`)
        .setDescription(description);
}

function successEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`✅ ${title}`)
        .setDescription(description);
}

function infoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(title)
        .setDescription(description);
}

function formatIdentity(nickname, auth, t) {
    return `**${nickname ?? t('common.unknown')}**\n\`${auth ?? t('common.none')}\``;
}

function formatEntryList(lines) {
    return lines.join('\n\n');
}

const MAX_DESCRIPTION = 4000;

function truncateDescription(text) {
    return text.length > MAX_DESCRIPTION ? text.slice(0, MAX_DESCRIPTION - 1) + '…' : text;
}

function formatStats(stat, t) {
    const games = stat[1];
    const wins = stat[2];
    const goals = stat[3];
    const blocks = stat[4];
    const assists = stat[5];
    const blocked = stat[6];
    const errors = stat[7];
    const aces = stat[8];
    const serves = stat[9];
    const time = stat[10];

    const winRate = games > 0 ? +(wins / games * 100).toFixed(1) : 0;
    const pob = (goals + blocked) > 0 ? +(goals / (goals + blocked) * 100).toFixed(1) : 0;
    const errPerGame = games > 0 ? +(errors / games).toFixed(1) : 0;
    const aceRate = serves > 0 ? +(aces / serves * 100).toFixed(1) : 0;
    const hours = (time / 60).toFixed(2);

    return [
        t('discord.statsFields.games', { value: games }),
        t('discord.statsFields.wins', { value: wins, rate: winRate }),
        t('discord.statsFields.goals', { value: goals }),
        t('discord.statsFields.pob', { value: pob, total: goals + blocked }),
        t('discord.statsFields.blocks', { value: blocks }),
        t('discord.statsFields.assists', { value: assists }),
        t('discord.statsFields.errors', { value: errors, perGame: errPerGame }),
        t('discord.statsFields.serves', { value: serves }),
        t('discord.statsFields.aces', { value: aces, rate: aceRate }),
        t('discord.statsFields.time', { hours })
    ].join('\n');
}

module.exports = function createDiscordCommands({ db, applyModeration, applyToRoom, discordBotSend, t }) {

    async function requireLinkedRole(interaction, minRole) {
        const account = await db.getAccountByDiscordId(interaction.user.id);

        if (!account) {
            await interaction.reply({
                embeds: [errorEmbed(t('discord.notLinkedTitle'), t('discord.notLinkedBody'))],
                ephemeral: true
            });
            return null;
        }

        const role = RoleString[account.role] ?? Role.PLAYER;

        if (role < minRole) {
            await interaction.reply({
                embeds: [errorEmbed(t('discord.insufficientRoleTitle'), t('discord.insufficientRoleBody', { role: ROLE_LABELS[minRole], yourRole: ROLE_LABELS[role] }))],
                ephemeral: true
            });
            return null;
        }

        return { auth: account.auth, nickname: account.nickname, role };
    }

    async function resolveStatsByNickname(nickname, index) {
        const pname = nickname.replace(/_/g, ' ').toLowerCase();
        const matches = await db.findStatsByName(pname);

        if (matches.length === 0) {
            return { error: t('discord.stats.notFoundBody', { nickname }) };
        }

        if (matches.length === 1) {
            const [auth, stat] = matches[0];
            return { auth, stat };
        }

        if (index == null || Number.isNaN(index) || index < 0 || index >= matches.length) {
            return { choices: matches };
        }

        const [auth, stat] = matches[index];
        return { auth, stat };
    }

    function formatChoices(matches) {
        return matches
            .map(([auth, stat], i) => t('discord.stats.choiceEntry', { index: i, name: stat[0], auth, games: stat[1] }))
            .join('\n');
    }

    function buildCommandDefinitions() {
        return [
            new SlashCommandBuilder()
                .setName('setrole')
                .setDescription(t('discord.command.setRole'))
                .addStringOption(o => o.setName('public_id').setDescription(t('discord.command.publicId')).setRequired(true))
                .addStringOption(o => o.setName('role')
                    .setDescription(t('discord.command.newRole'))
                    .setRequired(true)
                    .addChoices(
                        { name: 'player', value: 'player' },
                        { name: 'vip', value: 'vip' },
                        { name: 'preadmin', value: 'preadmin' },
                        { name: 'admin', value: 'admin' }
                    ))
                .addStringOption(o => o.setName('time').setDescription(t('discord.command.roleTime')).setRequired(false)),
            new SlashCommandBuilder()
                .setName('getrolelist')
                .setDescription(t('discord.command.roleList'))
                .addStringOption(o => o.setName('role')
                    .setDescription(t('discord.command.role'))
                    .setRequired(true)
                    .addChoices(
                        { name: 'player', value: 'player' },
                        { name: 'vip', value: 'vip' },
                        { name: 'preadmin', value: 'preadmin' },
                        { name: 'admin', value: 'admin' },
                        { name: 'master', value: 'master' }
                    )),
            new SlashCommandBuilder()
                .setName('password')
                .setDescription(t('discord.command.password'))
                .addStringOption(o => o.setName('room')
                    .setDescription(t('discord.command.room'))
                    .setRequired(true)
                    .addChoices(
                        { name: 'public', value: 'public' },
                        { name: 'private', value: 'private' }
                    ))
                .addStringOption(o => o.setName('value').setDescription(t('discord.command.passwordValue')).setRequired(false)),
            new SlashCommandBuilder()
                .setName('statsclear')
                .setDescription(t('discord.command.statsClear')),
            new SlashCommandBuilder()
                .setName('statsbackup')
                .setDescription(t('discord.command.statsBackup')),
            new SlashCommandBuilder()
                .setName('ban')
                .setDescription(t('discord.command.ban'))
                .addStringOption(o => o.setName('public_id').setDescription(t('discord.command.publicId')).setRequired(true))
                .addStringOption(o => o.setName('time').setDescription(t('discord.command.banTime')).setRequired(true))
                .addStringOption(o => o.setName('reason').setDescription(t('discord.command.reason')).setRequired(false)),
            new SlashCommandBuilder()
                .setName('unban')
                .setDescription(t('discord.command.unban'))
                .addStringOption(o => o.setName('public_id').setDescription(t('discord.command.publicId')).setRequired(true)),
            new SlashCommandBuilder()
                .setName('mute')
                .setDescription(t('discord.command.mute'))
                .addStringOption(o => o.setName('public_id').setDescription(t('discord.command.publicId')).setRequired(true))
                .addStringOption(o => o.setName('time').setDescription(t('discord.command.muteTime')).setRequired(true))
                .addStringOption(o => o.setName('reason').setDescription(t('discord.command.reason')).setRequired(false)),
            new SlashCommandBuilder()
                .setName('unmute')
                .setDescription(t('discord.command.unmute'))
                .addStringOption(o => o.setName('public_id').setDescription(t('discord.command.publicId')).setRequired(true)),
            new SlashCommandBuilder()
                .setName('bans')
                .setDescription(t('discord.command.bans')),
            new SlashCommandBuilder()
                .setName('mutes')
                .setDescription(t('discord.command.mutes')),
            new SlashCommandBuilder()
                .setName('tops')
                .setDescription(t('discord.command.tops'))
                .addStringOption(o => o.setName('stat')
                    .setDescription(t('discord.command.stat'))
                    .setRequired(true)
                    .addChoices(
                        { name: 'games', value: 'games' },
                        { name: 'wins', value: 'wins' },
                        { name: 'goals', value: 'goals' },
                        { name: 'blocks', value: 'blocks' },
                        { name: 'assists', value: 'assists' },
                        { name: 'aces', value: 'aces' },
                        { name: 'time', value: 'time' },
                        { name: 'all', value: 'all' }
                    ))
                .addIntegerOption(o => o.setName('count').setDescription(t('discord.command.count')).setRequired(false)),
            new SlashCommandBuilder()
                .setName('stats')
                .setDescription(t('discord.command.stats'))
                .addStringOption(o => o.setName('nickname').setDescription(t('discord.command.nickname')).setRequired(false))
                .addIntegerOption(o => o.setName('index').setDescription(t('discord.command.index')).setRequired(false)),
            new SlashCommandBuilder()
                .setName('account')
                .setDescription(t('discord.command.account'))
                .addStringOption(o => o.setName('public_id').setDescription(t('discord.command.accountPublicId')).setRequired(false))
        ].map(c => c.toJSON());
    }

    async function handleSetRole(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');
        const roleName = interaction.options.getString('role');
        const timeArg = interaction.options.getString('time');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.invalidPublicIdTitle'), t('discord.invalidPublicIdBody'))], ephemeral: true });
            return;
        }

        if (auth === caller.auth) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.setRole.selfTitle'), t('discord.setRole.selfBody'))], ephemeral: true });
            return;
        }

        const account = await db.getAccount(auth);
        if (!account) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.setRole.notFoundTitle'), t('discord.setRole.notFoundBody'))], ephemeral: true });
            return;
        }

        let date = null;
        if (timeArg) {
            const parsed = parseTimeArg(timeArg);
            if (!parsed) {
                await interaction.reply({ embeds: [errorEmbed(t('discord.invalidTimeTitle'), t('discord.invalidTimeBody', { example: '`30d`, `12h`' }))], ephemeral: true });
                return;
            }
            date = Date.now() + parsed.ms;
        }

        await db.setRole(auth, roleName, date);

        await applyModeration({type: 'roleUpdate', auth, roleName});

        await interaction.reply({
            embeds: [successEmbed(
                t('discord.setRole.successTitle'),
                t('discord.setRole.successBody', {
                    identity: formatIdentity(account.nickname, auth, t),
                    role: roleName.toUpperCase(),
                    until: date
                        ? t('discord.setRole.untilTimed', { timestamp: Math.floor(date / 1000) })
                        : t('discord.setRole.untilPermanent')
                })
            )]
        });
    }

    async function handleGetRoleList(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        const roleName = interaction.options.getString('role');
        const accounts = await db.getAccountsByRole(roleName);

        const description = accounts.length > 0
            ? truncateDescription(formatEntryList(
                accounts.map((a, i) => `**${i + 1}.** ${formatIdentity(a.nickname, a.auth, t)}`)
            ))
            : t('discord.getRoleList.empty');

        const embed = infoEmbed(t('discord.getRoleList.title', { role: roleName.toUpperCase(), count: accounts.length }), description);

        await interaction.reply({ embeds: [embed] });
    }

    async function handlePassword(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        const room = interaction.options.getString('room');
        const value = interaction.options.getString('value');

        const applied = await applyToRoom(room, { type: 'password', value: value || null });

        if (!applied) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.password.roomUnavailableTitle'), t('discord.password.roomUnavailableBody', { room }))], ephemeral: true });
            return;
        }

        await interaction.reply({
            embeds: [successEmbed(
                t('discord.password.successTitle'),
                value
                    ? t('discord.password.successSet', { room, value })
                    : t('discord.password.successCleared', { room })
            )]
        });
    }

    async function handleStatsClear(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        await interaction.deferReply();

        const backup = await db.backupStats();
        await db.clearStats();

        if (backup.count > 0) {
            discordBotSend.sendStatsBackup(BROADCAST_ROOM_LABEL, backup.filePath, backup.filename);
        }

        const payload = {
            embeds: [successEmbed(t('discord.statsClear.successTitle'), t('discord.statsClear.successBody', { filename: backup.filename, count: backup.count }))]
        };

        if (backup.count > 0) {
            const fs = require('node:fs');
            const { AttachmentBuilder } = require('discord.js');
            const buffer = fs.readFileSync(backup.filePath);
            payload.files = [new AttachmentBuilder(buffer, { name: backup.filename })];
        }

        await interaction.editReply(payload);
    }

    async function handleStatsBackup(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        await interaction.deferReply();

        const backup = await db.backupStats();

        const payload = {
            embeds: [successEmbed(t('discord.statsClear.successTitle'), t('discord.statsClear.successBody', { filename: backup.filename, count: backup.count }))]
        };

        if (backup.count > 0) {
            const fs = require('node:fs');
            const { AttachmentBuilder } = require('discord.js');
            const buffer = fs.readFileSync(backup.filePath);
            payload.files = [new AttachmentBuilder(buffer, { name: backup.filename })];
        }

        await interaction.editReply(payload);
    }

    async function handleBan(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');
        const timeArg = interaction.options.getString('time');
        const reason = interaction.options.getString('reason');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.invalidPublicIdTitle'), t('discord.invalidPublicIdBody'))], ephemeral: true });
            return;
        }

        const account = await db.getAccount(auth);
        const targetRole = RoleString[account?.role] ?? Role.PLAYER;

        if (auth === caller.auth || (targetRole >= Role.PREADMIN && caller.role !== Role.MASTER)) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.ban.selfOrProtectedTitle'), t('discord.ban.selfOrProtectedBody'))], ephemeral: true });
            return;
        }

        const parsed = parseTimeArg(timeArg);
        if (!parsed) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.invalidTimeTitle'), t('discord.invalidTimeBody', { example: '`10min`, `1d`' }))], ephemeral: true });
            return;
        }

        await db.addBan({
            auth,
            conn: null,
            name: account?.nickname ?? null,
            date: Date.now() + parsed.ms
        });

        const appliedLive = await applyModeration({
            type: 'ban',
            auth,
            name: caller.nickname,
            reason,
            timeStr: parsed.label
        });

        discordBotSend.sendReport(BROADCAST_ROOM_LABEL, caller.nickname, account?.nickname ?? auth, 'ban', reason || null, parsed.label);

        await interaction.reply({
            embeds: [successEmbed(
                t('discord.ban.successTitle'),
                t('discord.ban.successBody', {
                    identity: formatIdentity(account?.nickname, auth, t),
                    time: parsed.label,
                    reason: reason ? `, ${reason}` : '',
                    liveStatus: appliedLive ? t('discord.ban.liveKicked') : t('discord.ban.liveOffline')
                })
            )]
        });
    }

    async function handleUnban(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.invalidPublicIdTitle'), t('discord.invalidPublicIdBody'))], ephemeral: true });
            return;
        }

        const ban = await db.removeBanByAuth(auth);

        if (!ban) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.unban.notFoundTitle'), t('discord.unban.notFoundBody'))], ephemeral: true });
            return;
        }

        await applyModeration({ type: 'unban', auth, unban_id: ban.id ?? null});

        discordBotSend.sendReport(BROADCAST_ROOM_LABEL, caller.nickname, ban.name ?? ban.auth, 'unban', null, null);

        await interaction.reply({
            embeds: [successEmbed(t('discord.unban.successTitle'), formatIdentity(ban.name, ban.auth, t))]
        });
    }

    async function handleMute(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');
        const timeArg = interaction.options.getString('time');
        const reason = interaction.options.getString('reason');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.invalidPublicIdTitle'), t('discord.invalidPublicIdBody'))], ephemeral: true });
            return;
        }

        const account = await db.getAccount(auth);
        const targetRole = RoleString[account?.role] ?? Role.PLAYER;

        if (targetRole >= Role.PREADMIN && caller.role !== Role.MASTER) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.mute.protectedTitle'), t('discord.mute.protectedBody'))], ephemeral: true });
            return;
        }

        const parsed = parseTimeArg(timeArg);
        if (!parsed) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.invalidTimeTitle'), t('discord.invalidTimeBody', { example: '`10min`, `1h`' }))], ephemeral: true });
            return;
        }

        const existing = await db.getMuteByAuth(auth);
        if (existing) {
            await db.removeMuteByAuth(auth);
        }

        const unmuteDate = Date.now() + parsed.ms;
        const targetDisplay = account?.nickname ?? auth;

        await db.addMute({
            name: targetDisplay,
            playerId: null,
            auth,
            unmuteDate
        });

        const appliedLive = await applyModeration({
            type: 'mute',
            auth,
            name: caller.nickname,
            reason,
            timeStr: parsed.label,
            unmuteDate
        });

        discordBotSend.sendReport(BROADCAST_ROOM_LABEL, caller.nickname, targetDisplay, 'mute', reason || null, parsed.label);

        await interaction.reply({
            embeds: [successEmbed(
                t('discord.mute.successTitle'),
                t('discord.mute.successBody', {
                    identity: formatIdentity(account?.nickname, auth, t),
                    time: parsed.label,
                    reason: reason ? `, ${reason}` : '',
                    liveStatus: appliedLive ? t('discord.mute.liveApplied') : t('discord.mute.liveOffline')
                })
            )]
        });
    }

    async function handleUnmute(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.invalidPublicIdTitle'), t('discord.invalidPublicIdBody'))], ephemeral: true });
            return;
        }

        const removed = await db.removeMuteByAuth(auth);
        if (!removed) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.unmute.notFoundTitle'), t('discord.unmute.notFoundBody'))], ephemeral: true });
            return;
        }

        const appliedLive = await applyModeration({ type: 'unmute', auth });

        const account = await db.getAccount(auth);
        const targetDisplay = account?.nickname ?? auth;

        discordBotSend.sendReport(BROADCAST_ROOM_LABEL, caller.nickname, targetDisplay, 'unmute', null, null);

        await interaction.reply({
            embeds: [successEmbed(
                t('discord.unmute.successTitle'),
                `${formatIdentity(account?.nickname, auth, t)}${appliedLive ? t('discord.unmute.liveApplied') : ''}`
            )]
        });
    }

    async function handleBans(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const bans = await db.getBans();

        const description = bans.length > 0
            ? truncateDescription(formatEntryList(bans.map((b, i) => {
                const mins = Math.max(0, Math.round((b.date - Date.now()) / 1000 / 60));
                return t('discord.bans.entry', { index: i + 1, identity: formatIdentity(b.name, b.auth, t), mins });
            })))
            : t('discord.bans.empty');

        const embed = infoEmbed(t('discord.bans.title', { count: bans.length }), description);

        await interaction.reply({ embeds: [embed] });
    }

    async function handleMutes(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const mutes = await db.getMutes();

        const description = mutes.length > 0
            ? truncateDescription(formatEntryList(mutes.map((m, i) => {
                const mins = Math.max(0, Math.round((m.unmuteDate - Date.now()) / 1000 / 60));
                return t('discord.mutes.entry', { index: i + 1, identity: formatIdentity(m.name, m.auth, t), mins });
            })))
            : t('discord.mutes.empty');

        const embed = infoEmbed(t('discord.mutes.title', { count: mutes.length }), description);

        await interaction.reply({ embeds: [embed] });
    }

    const TOPS = {
        games: 1, wins: 2, goals: 3, blocks: 4, assists: 5, aces: 8, time: 10
    };

    async function handleTops(interaction) {
        const caller = await requireLinkedRole(interaction, Role.PLAYER);
        if (!caller) return;

        const statKey = interaction.options.getString('stat');
        let len = interaction.options.getInteger('count') ?? 10;
        if (len < 5 || len > 50) len = Math.min(50, Math.max(5, len));

        const list = await db.getTopStats(5);
        if (list.length < len) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.tops.notEnoughDataTitle'), t('discord.tops.notEnoughDataBody', { missing: len - list.length }))], ephemeral: true });
            return;
        }

        const formatTopLines = (key) => {
            const idx = TOPS[key];
            const sorted = [...list].sort((a, b) => b[idx] - a[idx]);
            return sorted.slice(0, len).map((s, i) => {
            const value = key === 'time' ? t('discord.statsFields.time', { hours: (s[idx] / 60).toFixed(1) }) : s[idx];
                return t('discord.tops.line', { index: i + 1, name: s[0] ?? t('common.unknown'), value });
            }).join('\n');
        };

        if (statKey === 'all') {
            const sections = Object.keys(TOPS).map(
                key => t('discord.tops.sectionHeader', { stat: key.toUpperCase(), lines: formatTopLines(key) })
            );

            const embed = infoEmbed(t('discord.tops.allTitle'), truncateDescription(formatEntryList(sections)));
            await interaction.reply({ embeds: [embed] });
            return;
        }

        const embed = infoEmbed(t('discord.tops.statTitle', { stat: statKey.toUpperCase() }), formatTopLines(statKey));

        await interaction.reply({ embeds: [embed] });
    }

    async function handleStats(interaction) {
        const caller = await requireLinkedRole(interaction, Role.PLAYER);
        if (!caller) return;

        const nickname = interaction.options.getString('nickname');
        const index = interaction.options.getInteger('index');

        let stat;

        if (!nickname) {
            stat = await db.getStat(caller.auth);
        } else {
            const resolved = await resolveStatsByNickname(nickname, index);

            if (resolved.error) {
                await interaction.reply({ embeds: [errorEmbed(t('discord.stats.notFoundTitle'), resolved.error)], ephemeral: true });
                return;
            }

            if (resolved.choices) {
                await interaction.reply({
                    embeds: [infoEmbed(
                        t('discord.stats.multipleFoundTitle', { count: resolved.choices.length, nickname }),
                        t('discord.stats.multipleFoundBody', { choices: formatChoices(resolved.choices) })
                    )]
                });
                return;
            }

            stat = resolved.stat;
        }

        if (!stat) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.stats.emptyTitle'), t('discord.stats.emptyBody'))], ephemeral: true });
            return;
        }

        await interaction.reply({
            embeds: [infoEmbed(`📊 ${stat[0]}`, formatStats(stat, t))]
        });
    }

    async function handleAccount(interaction) {
        const caller = await requireLinkedRole(interaction, Role.PLAYER);
        if (!caller) return;

        const publicId = interaction.options.getString('public_id');

        if (publicId && caller.role < Role.ADMIN) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.account.adminOnlyTitle'), t('discord.account.adminOnlyBody'))], ephemeral: true });
            return;
        }

        let targetAuth = caller.auth;
        if (publicId) {
            if (!isValidAuth(publicId)) {
                await interaction.reply({ embeds: [errorEmbed(t('discord.invalidPublicIdTitle'), t('discord.invalidPublicIdBody'))], ephemeral: true });
                return;
            }
            targetAuth = publicId;
        }

        const account = await db.getAccount(targetAuth);
        if (!account) {
            await interaction.reply({ embeds: [errorEmbed(t('discord.account.notFoundTitle'), `\`${targetAuth}\``)], ephemeral: true });
            return;
        }

        const toDate = account.date != null ? `<t:${Math.floor(account.date / 1000)}:f>` : t('discord.account.untilPermanent');
        const discordField = account.discord ? `<@${account.discord}>` : t('discord.account.discordUnlinked');

        const embed = infoEmbed(
            t('discord.account.title', { nickname: account.nickname }),
            t('discord.account.body', { identity: formatIdentity(account.nickname, targetAuth, t), role: account.role, until: toDate, discord: discordField })
        );

        await interaction.reply({ embeds: [embed] });
    }

    const HANDLERS = {
        setrole: handleSetRole,
        getrolelist: handleGetRoleList,
        password: handlePassword,
        statsclear: handleStatsClear,
        statsbackup: handleStatsBackup,
        ban: handleBan,
        unban: handleUnban,
        mute: handleMute,
        unmute: handleUnmute,
        bans: handleBans,
        mutes: handleMutes,
        tops: handleTops,
        stats: handleStats,
        account: handleAccount
    };

    async function handleInteraction(interaction) {
        if (!interaction.isChatInputCommand()) return false;
        const handler = HANDLERS[interaction.commandName];
        if (!handler) return false;

        try {
            await handler(interaction);
        } catch (err) {
            console.error(`[Discord] /${interaction.commandName} failed:`, err);
            const payload = { embeds: [errorEmbed(t('discord.genericErrorTitle'), t('discord.genericErrorBody'))], ephemeral: true };
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(payload).catch(() => {});
            } else {
                await interaction.reply(payload).catch(() => {});
            }
        }
        return true;
    }

    return {
        buildCommandDefinitions,
        handleInteraction
    };
};