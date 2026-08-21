const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
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

function nextMuteId(existingMutes) {
    return existingMutes.reduce((max, m) => Math.max(max, m.id ?? 0), 0) + 1;
}

function nextBanId(existingBans) {
    return existingBans.reduce((max, b) => Math.max(max, b.id ?? 0), 0) + 1;
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
        `**Игры:** ${games}  **Победы:** ${wins} (${winRate}%)`,
        `**Голы:** ${goals}  **ПОБ:** ${pob}% (из ${goals + blocked})`,
        `**Блоки:** ${blocks}  **Пасы:** ${assists}`,
        `**Ошибки:** ${errors} (${errPerGame}/игра)`,
        `**Подачи:** ${serves}  **ЭЙСы:** ${aces} (${aceRate}%)`,
        `**Время:** ${hours}ч`
    ].join('\n');
}

function isValidAuth(str) {
    return typeof str === 'string' && str.length === 43;
}

module.exports = function createDiscordCommands({ db, applyModeration }) {

    /*
     * Every command requires the caller to have linked their Discord
     * account to a HaxBall account (accounts.discord) AND to hold at
     * least `minRole` in that account. Returns the account row on
     * success, or null after already replying with an error.
     */
    async function requireLinkedRole(interaction, minRole) {
        const account = await db.getAccountByDiscordId(interaction.user.id);

        if (!account) {
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(ERROR_COLOR)
                    .setDescription('❌ Ваш Discord не привязан к аккаунту HaxBall. Используйте `/link` для привязки.')],
                ephemeral: true
            });
            return null;
        }

        const role = RoleString[account.role] ?? Role.PLAYER;

        if (role < minRole) {
            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(ERROR_COLOR)
                    .setDescription(`❌ Недостаточно прав. Требуется роль **${ROLE_LABELS[minRole]}** и выше, у вас — **${ROLE_LABELS[role]}**.`)],
                ephemeral: true
            });
            return null;
        }

        return { ...account, auth: account.auth, role };
    }

    /*
     * Resolves a "player" command argument into a target auth. Accepts
     * either a raw HaxBall public_id (43 chars) or a nickname, resolved
     * against the stats table (same source !stats/!deanon use in-room).
     * Nickname lookups can return multiple matches — the caller decides
     * how to report that.
     */
    async function resolveTarget(query) {
        if (query.length === 43) {
            const account = await db.getAccount(query);
            if (!account) return { error: `Аккаунт с public_id \`${query}\` не найден.` };
            return { auth: query, account };
        }

        const pname = query.replace(/_/g, ' ').toLowerCase();
        const matches = await db.findStatsByName(pname);

        if (matches.length === 0) {
            return { error: `Игрок с ником \`${query}\` не найден в статистике.` };
        }

        if (matches.length > 1) {
            const names = matches.map(([auth, stat]) => `\`${stat[0]}\` (${auth})`).join('\n');
            return { error: `Найдено несколько игроков с таким ником, уточните через public_id:\n${names}` };
        }

        const [auth] = matches[0];
        const account = await db.getAccount(auth);
        return { auth, account };
    }

    function buildCommandDefinitions() {
        return [
            new SlashCommandBuilder()
                .setName('setrole')
                .setDescription('[MASTER] Выдать роль игроку')
                .addStringOption(o => o.setName('player').setDescription('Ник или public_id игрока').setRequired(true))
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
                    .setDescription('Показатель')
                    .setRequired(true)
                    .addChoices(
                        { name: 'games', value: 'games' },
                        { name: 'wins', value: 'wins' },
                        { name: 'goals', value: 'goals' },
                        { name: 'blocks', value: 'blocks' },
                        { name: 'assists', value: 'assists' },
                        { name: 'aces', value: 'aces' },
                        { name: 'time', value: 'time' }
                    ))
                .addIntegerOption(o => o.setName('count').setDescription('Сколько строк (5-50, по умолчанию 10)').setRequired(false)),
            new SlashCommandBuilder()
                .setName('stats')
                .setDescription('Статистика игрока')
                .addStringOption(o => o.setName('player').setDescription('Ник или public_id (пусто = вы сами)').setRequired(false)),
            new SlashCommandBuilder()
                .setName('account')
                .setDescription('Информация об аккаунте')
                .addStringOption(o => o.setName('player').setDescription('Ник или public_id (пусто = вы сами, требуется ADMIN для чужих)').setRequired(false))
        ].map(c => c.toJSON());
    }

    async function handleSetRole(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        const query = interaction.options.getString('player');
        const roleName = interaction.options.getString('role');
        const timeArg = interaction.options.getString('time');

        const target = await resolveTarget(query);
        if (target.error) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription(`❌ ${target.error}`)], ephemeral: true });
            return;
        }

        if (target.auth === caller.auth) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ Нельзя менять роль себе.')], ephemeral: true });
            return;
        }

        let date = null;
        if (timeArg) {
            const parsed = parseTimeArg(timeArg);
            if (!parsed) {
                await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ Некорректный формат времени, пример: `30d`, `12h`.')], ephemeral: true });
                return;
            }
            date = Date.now() + parsed.ms;
        }

        db.setRole(target.auth, roleName, date);

        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setDescription(`✅ ${target.account?.nickname ?? target.auth} теперь **${roleName.toUpperCase()}**${date ? ` до <t:${Math.floor(date / 1000)}:f>` : ' (бессрочно)'}.`)]
        });
    }

    async function handleGetRoleList(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        const roleName = interaction.options.getString('role');
        const accounts = db.getAccountsByRole(roleName);

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`${roleName.toUpperCase()} — ${accounts.length}`)
            .setDescription(
                accounts.length === 0
                    ? 'Пусто.'
                    : accounts.map((a, i) => `${i + 1}. ${a.nickname} (\`${a.auth}\`)`).join('\n').slice(0, 4000)
            );

        await interaction.reply({ embeds: [embed] });
    }

    async function handlePassword(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(ERROR_COLOR)
                .setDescription('❌ Смена пароля комнаты пока недоступна из Discord — используйте `!password` прямо в HaxBall-комнате.')],
            ephemeral: true
        });
    }

    async function handleStatsClear(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        await interaction.deferReply();

        const backup = db.backupStats();
        db.clearStats();

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setDescription(`✅ Статистика сброшена. Бекап: \`${backup.filename}\`, записей: ${backup.count}.`)]
        });
    }

    async function handleBan(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');
        const timeArg = interaction.options.getString('time');
        const reason = interaction.options.getString('reason');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const account = await db.getAccount(auth);
        const targetRole = RoleString[account?.role] ?? Role.PLAYER;

        if (auth === caller.auth || (targetRole >= Role.PREADMIN && caller.role !== Role.MASTER)) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ Нельзя забанить себя или игрока с защитой от бана.')], ephemeral: true });
            return;
        }

        const parsed = parseTimeArg(timeArg);
        if (!parsed) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ Некорректный формат времени, пример: `10min`, `1d`.')], ephemeral: true });
            return;
        }

        const existingBans = db.getBans();
        db.addBan({
            id: nextBanId(existingBans),
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

        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setDescription(
                    `✅ ${account?.nickname ?? auth} забанен на ${parsed.label}${reason ? ` по причине: ${reason}` : ''}.\n` +
                    (appliedLive ? '🔴 Игрок был в комнате — кикнут немедленно.' : 'Игрока сейчас нет в комнате — бан применится при следующем заходе.')
                )]
        });
    }

    async function handleUnban(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const ban = db.removeBanByAuth(auth);

        if (!ban) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ Этот public_id не найден в бан-листе.')], ephemeral: true });
            return;
        }

        await applyModeration({ type: 'unban', auth });

        await interaction.reply({
            embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`✅ ${ban.name ?? ban.auth} разбанен.`)]
        });
    }

    async function handleMute(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');
        const timeArg = interaction.options.getString('time');
        const reason = interaction.options.getString('reason');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const account = await db.getAccount(auth);
        const targetRole = RoleString[account?.role] ?? Role.PLAYER;

        if (targetRole >= Role.PREADMIN && caller.role !== Role.MASTER) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ У игрока защита от мута.')], ephemeral: true });
            return;
        }

        const parsed = parseTimeArg(timeArg);
        if (!parsed) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ Некорректный формат времени, пример: `10min`, `1h`.')], ephemeral: true });
            return;
        }

        const existing = db.getMuteByAuth(auth);
        if (existing) {
            db.removeMuteByAuth(auth);
        }

        const mutes = db.getMutes();
        const muteId = nextMuteId(mutes);
        const unmuteDate = Date.now() + parsed.ms;

        db.addMute({
            id: muteId,
            name: account?.nickname ?? auth,
            playerId: null,
            auth,
            unmuteDate
        });

        const appliedLive = await applyModeration({
            type: 'mute',
            auth,
            reason,
            timeStr: parsed.label,
            unmuteDate,
            muteId
        });

        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setDescription(
                    `✅ ${account?.nickname ?? auth} замучен на ${parsed.label}${reason ? ` по причине: ${reason}` : ''}.\n` +
                    (appliedLive ? '🔴 Игрок был в комнате — мут вступил в силу немедленно.' : 'Игрока сейчас нет в комнате — мут применится при следующем заходе.')
                )]
        });
    }

    async function handleUnmute(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const removed = db.removeMuteByAuth(auth);
        if (!removed) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ Этот игрок не в муте.')], ephemeral: true });
            return;
        }

        const appliedLive = await applyModeration({ type: 'unmute', auth });

        const account = await db.getAccount(auth);
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setDescription(
                    `✅ ${account?.nickname ?? auth} размучен.` +
                    (appliedLive ? ' Применено немедленно.' : '')
                )]
        });
    }

    async function handleBans(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const bans = db.getBans();
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`Бан-лист — ${bans.length}`)
            .setDescription(
                bans.length === 0
                    ? 'Пусто.'
                    : bans.map((b, i) => {
                        const mins = Math.round((b.date - Date.now()) / 1000 / 60);
                        return `${i + 1}. ${b.name ?? b.auth} (${mins}мин)`;
                    }).join('\n').slice(0, 4000)
            );

        await interaction.reply({ embeds: [embed] });
    }

    async function handleMutes(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const mutes = db.getMutes();
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`Мут-лист — ${mutes.length}`)
            .setDescription(
                mutes.length === 0
                    ? 'Пусто.'
                    : mutes.map((m, i) => {
                        const mins = Math.round((m.unmuteDate - Date.now()) / 1000 / 60);
                        return `${i + 1}. ${m.name} (${mins}мин)`;
                    }).join('\n').slice(0, 4000)
            );

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

        const list = db.getTopStats(5);
        if (list.length < len) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription(`❌ Недостаточно игроков в топе: ещё ${len - list.length}.`)], ephemeral: true });
            return;
        }

        const idx = TOPS[statKey];
        const sorted = [...list].sort((a, b) => b[idx] - a[idx]);
        const lines = sorted.slice(0, len).map((s, i) => {
            const value = statKey === 'time' ? `${(s[idx] / 60).toFixed(2)}ч` : s[idx];
            return `${i + 1}. ${s[0]} — ${value}`;
        });

        await interaction.reply({
            embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle(`Топ: ${statKey}`).setDescription(lines.join('\n'))]
        });
    }

    async function handleStats(interaction) {
        const caller = await requireLinkedRole(interaction, Role.PLAYER);
        if (!caller) return;

        const query = interaction.options.getString('player');
        const auth = query ? null : caller.auth;

        let targetAuth = auth;
        let label = null;

        if (!targetAuth) {
            const resolved = await resolveTarget(query);
            if (resolved.error) {
                await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription(`❌ ${resolved.error}`)], ephemeral: true });
                return;
            }
            targetAuth = resolved.auth;
        }

        const stat = db.getStat(targetAuth);
        if (!stat) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ Статистика не найдена — нужно сыграть хотя бы одну игру.')], ephemeral: true });
            return;
        }

        await interaction.reply({
            embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle(`📊 ${stat[0]}`).setDescription(formatStats(stat))]
        });
    }

    async function handleAccount(interaction) {
        const caller = await requireLinkedRole(interaction, Role.PLAYER);
        if (!caller) return;

        const query = interaction.options.getString('player');

        if (query && caller.role < Role.ADMIN) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ Смотреть чужие аккаунты могут только ADMIN и выше.')], ephemeral: true });
            return;
        }

        let targetAuth = caller.auth;
        if (query) {
            const resolved = await resolveTarget(query);
            if (resolved.error) {
                await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription(`❌ ${resolved.error}`)], ephemeral: true });
                return;
            }
            targetAuth = resolved.auth;
        }

        const account = await db.getAccount(targetAuth);
        if (!account) {
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ Аккаунт не найден.')], ephemeral: true });
            return;
        }

        const toDate = account.date != null ? `<t:${Math.floor(account.date / 1000)}:f>` : 'бессрочно';
        const discordField = account.discord ? `<@${account.discord}>` : 'не привязан';

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`📋 ${account.nickname}`)
            .setDescription(
                `**public_id:** \`${targetAuth}\`\n` +
                `**role:** ${account.role}\n` +
                `**to_date:** ${toDate}\n` +
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
            const payload = {
                embeds: [new EmbedBuilder().setColor(ERROR_COLOR).setDescription('❌ Произошла ошибка при выполнении команды.')],
                ephemeral: true
            };
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