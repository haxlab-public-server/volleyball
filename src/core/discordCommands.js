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

function formatIdentity(nickname, auth) {
    return `**${nickname ?? 'UNKNOWN'}**\n\`${auth ?? '—'}\``;
}

function formatEntryList(lines) {
    return lines.join('\n\n');
}

const MAX_DESCRIPTION = 4000;

function truncateDescription(text) {
    return text.length > MAX_DESCRIPTION ? text.slice(0, MAX_DESCRIPTION - 1) + '…' : text;
}

function formatStats(stat) {
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
        `**Игры:** ${games}`,
        `**Победы:** ${wins} (${winRate}%)`,
        `**Голы:** ${goals}`,
        `**ПОБ:** ${pob}% (из ${goals + blocked})`,
        `**Блоки:** ${blocks}`,
        `**Пасы:** ${assists}`,
        `**Ошибки:** ${errors} (${errPerGame}/игра)`,
        `**Подачи:** ${serves}`,
        `**ЭЙСы:** ${aces} (${aceRate}%)`,
        `**Время:** ${hours}ч`
    ].join('\n');
}

module.exports = function createDiscordCommands({ db, applyModeration, applyToRoom, discordBotSend }) {

    async function requireLinkedRole(interaction, minRole) {
        const account = await db.getAccountByDiscordId(interaction.user.id);

        if (!account) {
            await interaction.reply({
                embeds: [errorEmbed('Discord не привязан', 'Используйте `/link`, затем `!discord <код>` в комнате, чтобы привязать аккаунт HaxBall.')],
                ephemeral: true
            });
            return null;
        }

        const role = RoleString[account.role] ?? Role.PLAYER;

        if (role < minRole) {
            await interaction.reply({
                embeds: [errorEmbed('Недостаточно прав', `Требуется роль **${ROLE_LABELS[minRole]}** и выше, у вас — **${ROLE_LABELS[role]}**.`)],
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
            return { error: `Игрок с ником \`${nickname}\` не найден в статистике.` };
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
            .map(([auth, stat], i) => `[${i}] ${stat[0]} (${auth}) - ${stat[1]} игр`)
            .join('\n');
    }

    function buildCommandDefinitions() {
        return [
            new SlashCommandBuilder()
                .setName('setrole')
                .setDescription('[MASTER] Выдать роль игроку')
                .addStringOption(o => o.setName('public_id').setDescription('public_id игрока (43 символа)').setRequired(true))
                .addStringOption(o => o.setName('role')
                    .setDescription('Новая роль')
                    .setRequired(true)
                    .addChoices(
                        { name: 'player', value: 'player' },
                        { name: 'vip', value: 'vip' },
                        { name: 'preadmin', value: 'preadmin' },
                        { name: 'admin', value: 'admin' }
                    ))
                .addStringOption(o => o.setName('time').setDescription('Время действия роли, напр. 30d (пусто = бессрочно)').setRequired(false)),
            new SlashCommandBuilder()
                .setName('getrolelist')
                .setDescription('[MASTER] Список игроков с заданной ролью')
                .addStringOption(o => o.setName('role')
                    .setDescription('Роль')
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
                .setDescription('[MASTER] Установить/сбросить пароль комнаты')
                .addStringOption(o => o.setName('room')
                    .setDescription('Комната')
                    .setRequired(true)
                    .addChoices(
                        { name: 'public', value: 'public' },
                        { name: 'private', value: 'private' }
                    ))
                .addStringOption(o => o.setName('value').setDescription('Новый пароль (пусто = сбросить)').setRequired(false)),
            new SlashCommandBuilder()
                .setName('statsclear')
                .setDescription('[MASTER] Сбросить всю статистику (с бекапом)'),
            new SlashCommandBuilder()
                .setName('ban')
                .setDescription('[ADMIN] Забанить игрока')
                .addStringOption(o => o.setName('public_id').setDescription('public_id игрока (43 символа)').setRequired(true))
                .addStringOption(o => o.setName('time').setDescription('Время бана, напр. 10min / 1d').setRequired(true))
                .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(false)),
            new SlashCommandBuilder()
                .setName('unban')
                .setDescription('[ADMIN] Разбанить игрока')
                .addStringOption(o => o.setName('public_id').setDescription('public_id игрока (43 символа)').setRequired(true)),
            new SlashCommandBuilder()
                .setName('mute')
                .setDescription('[ADMIN] Замутить игрока')
                .addStringOption(o => o.setName('public_id').setDescription('public_id игрока (43 символа)').setRequired(true))
                .addStringOption(o => o.setName('time').setDescription('Время мута, напр. 10min / 1h').setRequired(true))
                .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(false)),
            new SlashCommandBuilder()
                .setName('unmute')
                .setDescription('[ADMIN] Размутить игрока')
                .addStringOption(o => o.setName('public_id').setDescription('public_id игрока (43 символа)').setRequired(true)),
            new SlashCommandBuilder()
                .setName('bans')
                .setDescription('[ADMIN] Список банов'),
            new SlashCommandBuilder()
                .setName('mutes')
                .setDescription('[ADMIN] Список мутов'),
            new SlashCommandBuilder()
                .setName('tops')
                .setDescription('Топ игроков по показателю')
                .addStringOption(o => o.setName('stat')
                    .setDescription('Показатель (или "all" — сразу все топы)')
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
                .addIntegerOption(o => o.setName('count').setDescription('Сколько строк (5-50, по умолчанию 10)').setRequired(false)),
            new SlashCommandBuilder()
                .setName('stats')
                .setDescription('Статистика игрока')
                .addStringOption(o => o.setName('nickname').setDescription('Ник игрока (пусто = вы сами)').setRequired(false))
                .addIntegerOption(o => o.setName('index').setDescription('Номер из списка, если ников несколько').setRequired(false)),
            new SlashCommandBuilder()
                .setName('account')
                .setDescription('Информация об аккаунте')
                .addStringOption(o => o.setName('public_id').setDescription('public_id игрока (пусто = вы сами, требуется ADMIN для чужих)').setRequired(false))
        ].map(c => c.toJSON());
    }

    async function handleSetRole(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');
        const roleName = interaction.options.getString('role');
        const timeArg = interaction.options.getString('time');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed('Неверный public_id', 'public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        if (auth === caller.auth) {
            await interaction.reply({ embeds: [errorEmbed('Недопустимое действие', 'Нельзя менять роль себе.')], ephemeral: true });
            return;
        }

        const account = await db.getAccount(auth);
        if (!account) {
            await interaction.reply({ embeds: [errorEmbed('Аккаунт не найден', 'Аккаунт с таким public_id не найден.')], ephemeral: true });
            return;
        }

        let date = null;
        if (timeArg) {
            const parsed = parseTimeArg(timeArg);
            if (!parsed) {
                await interaction.reply({ embeds: [errorEmbed('Неверный формат времени', 'Пример: `30d`, `12h`.')], ephemeral: true });
                return;
            }
            date = Date.now() + parsed.ms;
        }

        await db.setRole(auth, roleName, date);

        await applyModeration({type: 'roleUpdate', auth, roleName});

        await interaction.reply({
            embeds: [successEmbed(
                'Роль обновлена',
                `${formatIdentity(account.nickname, auth)}\nтеперь **${roleName.toUpperCase()}**${date ? ` до <t:${Math.floor(date / 1000)}:f>` : ' (бессрочно)'}.`
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
                accounts.map((a, i) => `**${i + 1}.** ${formatIdentity(a.nickname, a.auth)}`)
            ))
            : 'Пусто.';

        const embed = infoEmbed(`📋 ${roleName.toUpperCase()} — ${accounts.length}`, description);

        await interaction.reply({ embeds: [embed] });
    }

    async function handlePassword(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        const room = interaction.options.getString('room');
        const value = interaction.options.getString('value');

        const applied = await applyToRoom(room, { type: 'password', value: value || null });

        if (!applied) {
            await interaction.reply({ embeds: [errorEmbed('Комната недоступна', `Комната **${room}** сейчас не запущена.`)], ephemeral: true });
            return;
        }

        await interaction.reply({
            embeds: [successEmbed(
                'Пароль обновлён',
                value
                    ? `Комната **${room}**\nновый пароль: \`${value}\``
                    : `Комната **${room}**\nпароль сброшен.`
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
            embeds: [successEmbed('Статистика сброшена', `Бекап: \`${backup.filename}\`\nзаписей: ${backup.count}`)]
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
            await interaction.reply({ embeds: [errorEmbed('Неверный public_id', 'public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const account = await db.getAccount(auth);
        const targetRole = RoleString[account?.role] ?? Role.PLAYER;

        if (auth === caller.auth || (targetRole >= Role.PREADMIN && caller.role !== Role.MASTER)) {
            await interaction.reply({ embeds: [errorEmbed('Недопустимое действие', 'Нельзя забанить себя или игрока с защитой от бана.')], ephemeral: true });
            return;
        }

        const parsed = parseTimeArg(timeArg);
        if (!parsed) {
            await interaction.reply({ embeds: [errorEmbed('Неверный формат времени', 'Пример: `10min`, `1d`.')], ephemeral: true });
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
                'Игрок забанен',
                `${formatIdentity(account?.nickname, auth)}\n` +
                `на **${parsed.label}**${reason ? `, причина: ${reason}` : ''}\n` +
                (appliedLive ? '🔴 Был в комнате — кикнут немедленно.' : 'Не в комнате — бан вступит в силу при следующем заходе.')
            )]
        });
    }

    async function handleUnban(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed('Неверный public_id', 'public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const ban = await db.removeBanByAuth(auth);

        if (!ban) {
            await interaction.reply({ embeds: [errorEmbed('Не найдено', 'Этот public_id не найден в бан-листе.')], ephemeral: true });
            return;
        }

        await applyModeration({ type: 'unban', auth, unban_id: ban.id ?? null});

        discordBotSend.sendReport(BROADCAST_ROOM_LABEL, caller.nickname, ban.name ?? ban.auth, 'unban', null, null);

        await interaction.reply({
            embeds: [successEmbed('Игрок разбанен', formatIdentity(ban.name, ban.auth))]
        });
    }

    async function handleMute(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');
        const timeArg = interaction.options.getString('time');
        const reason = interaction.options.getString('reason');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed('Неверный public_id', 'public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const account = await db.getAccount(auth);
        const targetRole = RoleString[account?.role] ?? Role.PLAYER;

        if (targetRole >= Role.PREADMIN && caller.role !== Role.MASTER) {
            await interaction.reply({ embeds: [errorEmbed('Недопустимое действие', 'У игрока защита от мута.')], ephemeral: true });
            return;
        }

        const parsed = parseTimeArg(timeArg);
        if (!parsed) {
            await interaction.reply({ embeds: [errorEmbed('Неверный формат времени', 'Пример: `10min`, `1h`.')], ephemeral: true });
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
                'Игрок замучен',
                `${formatIdentity(account?.nickname, auth)}\n` +
                `на **${parsed.label}**${reason ? `, причина: ${reason}` : ''}\n` +
                (appliedLive ? '🔴 Был в комнате — вступило в силу немедленно.' : 'Не в комнате — мут применится при следующем заходе.')
            )]
        });
    }

    async function handleUnmute(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed('Неверный public_id', 'public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const removed = await db.removeMuteByAuth(auth);
        if (!removed) {
            await interaction.reply({ embeds: [errorEmbed('Не найдено', 'Этот игрок не в муте.')], ephemeral: true });
            return;
        }

        const appliedLive = await applyModeration({ type: 'unmute', auth });

        const account = await db.getAccount(auth);
        const targetDisplay = account?.nickname ?? auth;

        discordBotSend.sendReport(BROADCAST_ROOM_LABEL, caller.nickname, targetDisplay, 'unmute', null, null);

        await interaction.reply({
            embeds: [successEmbed(
                'Игрок размучен',
                `${formatIdentity(account?.nickname, auth)}` + (appliedLive ? '\nПрименено немедленно.' : '')
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
                return `**${i + 1}.** ${formatIdentity(b.name, b.auth)}\nосталось: ${mins}м`;
            })))
            : 'Пусто.';

        const embed = infoEmbed(`📋 Бан-лист — ${bans.length}`, description);

        await interaction.reply({ embeds: [embed] });
    }

    async function handleMutes(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const mutes = await db.getMutes();

        const description = mutes.length > 0
            ? truncateDescription(formatEntryList(mutes.map((m, i) => {
                const mins = Math.max(0, Math.round((m.unmuteDate - Date.now()) / 1000 / 60));
                return `**${i + 1}.** ${formatIdentity(m.name, m.auth)}\nосталось: ${mins}м`;
            })))
            : 'Пусто.';

        const embed = infoEmbed(`📋 Мут-лист — ${mutes.length}`, description);

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
            await interaction.reply({ embeds: [errorEmbed('Недостаточно данных', `Недостаточно игроков в топе: ещё ${len - list.length}.`)], ephemeral: true });
            return;
        }

        const formatTopLines = (key) => {
            const idx = TOPS[key];
            const sorted = [...list].sort((a, b) => b[idx] - a[idx]);
            return sorted.slice(0, len).map((s, i) => {
                const value = key === 'time' ? `${(s[idx] / 60).toFixed(1)}ч` : s[idx];
                return `\`${i + 1}.\` **${s[0] ?? 'UNKNOWN'}** — ${value}`;
            }).join('\n');
        };

        if (statKey === 'all') {
            const sections = Object.keys(TOPS).map(
                key => `**🏆 Топ по ${key.toUpperCase()}**\n${formatTopLines(key)}`
            );

            const embed = infoEmbed('📊 Топы игроков', truncateDescription(formatEntryList(sections)));
            await interaction.reply({ embeds: [embed] });
            return;
        }

        const embed = infoEmbed(`📊 Топ: ${statKey.toUpperCase()}`, formatTopLines(statKey));

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
                await interaction.reply({ embeds: [errorEmbed('Не найдено', resolved.error)], ephemeral: true });
                return;
            }

            if (resolved.choices) {
                await interaction.reply({
                    embeds: [infoEmbed(
                        `Найдено ${resolved.choices.length} игроков с ником "${nickname}"`,
                        `${formatChoices(resolved.choices)}\n\nПовторите команду с аргументом \`index\`, чтобы выбрать нужного.`
                    )]
                });
                return;
            }

            stat = resolved.stat;
        }

        if (!stat) {
            await interaction.reply({ embeds: [errorEmbed('Статистика не найдена', 'Нужно сыграть хотя бы одну игру.')], ephemeral: true });
            return;
        }

        await interaction.reply({
            embeds: [infoEmbed(`📊 ${stat[0]}`, formatStats(stat))]
        });
    }

    async function handleAccount(interaction) {
        const caller = await requireLinkedRole(interaction, Role.PLAYER);
        if (!caller) return;

        const publicId = interaction.options.getString('public_id');

        if (publicId && caller.role < Role.ADMIN) {
            await interaction.reply({ embeds: [errorEmbed('Недостаточно прав', 'Смотреть чужие аккаунты могут только ADMIN и выше.')], ephemeral: true });
            return;
        }

        let targetAuth = caller.auth;
        if (publicId) {
            if (!isValidAuth(publicId)) {
                await interaction.reply({ embeds: [errorEmbed('Неверный public_id', 'public_id должен быть строкой из 43 символов.')], ephemeral: true });
                return;
            }
            targetAuth = publicId;
        }

        const account = await db.getAccount(targetAuth);
        if (!account) {
            await interaction.reply({ embeds: [errorEmbed('Аккаунт не найден', `\`${targetAuth}\``)], ephemeral: true });
            return;
        }

        const toDate = account.date != null ? `<t:${Math.floor(account.date / 1000)}:f>` : 'бессрочно';
        const discordField = account.discord ? `<@${account.discord}>` : 'не привязан';

        const embed = infoEmbed(
            `📋 ${account.nickname}`,
            `${formatIdentity(account.nickname, targetAuth)}\n` +
            `**роль:** ${account.role}\n` +
            `**до:** ${toDate}\n` +
            `**discord:** ${discordField}`
        );

        await interaction.reply({ embeds: [embed] });
    }

    const HANDLERS = {
        setrole: handleSetRole,
        getrolelist: handleGetRoleList,
        password: handlePassword,
        statsclear: handleStatsClear,
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
            const payload = { embeds: [errorEmbed('Ошибка', 'Произошла ошибка при выполнении команды.')], ephemeral: true };
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