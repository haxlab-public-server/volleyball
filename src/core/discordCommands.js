const {
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

/*
 * Registers Discord slash-command mirrors of the in-room HaxBall commands
 * listed by role tier:
 *   MASTER  — /setrole, /getrolelist, /password, /statsclear
 *   ADMIN   — /ban, /unban, /mute, /unmute, /bans, /mutes
 *   PLAYER  — /tops, /stats, /account (any linked account)
 *
 * Access is gated purely by the HaxBall account role tied to the caller's
 * Discord account (accounts.discord) — a caller must have linked their
 * account (`/link` + `!discord <code>`) and hold a sufficient in-room
 * role. This piggybacks on the same role hierarchy the room itself uses
 * instead of introducing a second, possibly-drifting permission system.
 *
 * Every command that targets a specific player (setrole, ban, unban,
 * mute, unmute, account-for-others) takes a raw public_id (43-char auth)
 * — no nickname resolution. /stats and /tops are read-only lookups where
 * nickname collisions are common and harmless to disambiguate, so those
 * two support a nickname argument; when a nickname matches more than one
 * account, the reply lists `[index] nickname (public_id) - N игр` and the
 * caller re-runs the command with an extra `index` argument to pick one.
 *
 * ban/mute/unban/unmute/password write their durable state (DB row, or
 * browser-side state.roomPassword) first, then call the `applyModeration`
 * / `applyToRoom` bridges (wired in from src/index.js once rooms are
 * launched) to broadcast the change into the live room(s) via
 * page.evaluate() — so an online target is kicked/muted, or the room
 * password changes, immediately instead of waiting for a rejoin.
 *
 * Logging mirrors exactly what each in-room command already does — no
 * more, no less: ban/unban/mute/unmute call discordBot.sendReport (same
 * as admin.js), statsclear calls discordBot.sendStatsBackup (same as
 * master.js). setrole/getrolelist/password/tops/stats/account/bans/mutes
 * don't log anything in their in-room counterparts either, so they stay
 * silent here too.
 */

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

function errorEmbed(text) {
    return new EmbedBuilder().setColor(ERROR_COLOR).setDescription(`❌ ${text}`);
}

function okEmbed(text) {
    return new EmbedBuilder().setColor(EMBED_COLOR).setDescription(text);
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

    /*
     * Every command requires the caller to have linked their Discord
     * account to a HaxBall account (accounts.discord) AND to hold at
     * least `minRole` in that account. Returns { auth, nickname, role }
     * on success, or null after already replying with an error.
     */
    async function requireLinkedRole(interaction, minRole) {
        const account = await db.getAccountByDiscordId(interaction.user.id);

        if (!account) {
            await interaction.reply({
                embeds: [errorEmbed('Ваш Discord не привязан к аккаунту HaxBall. Используйте `/link`, затем `!discord <код>` в комнате.')],
                ephemeral: true
            });
            return null;
        }

        const role = RoleString[account.role] ?? Role.PLAYER;

        if (role < minRole) {
            await interaction.reply({
                embeds: [errorEmbed(`Недостаточно прав. Требуется роль **${ROLE_LABELS[minRole]}** и выше, у вас — **${ROLE_LABELS[role]}**.`)],
                ephemeral: true
            });
            return null;
        }

        return { auth: account.auth, nickname: account.nickname, role };
    }

    /*
     * Resolves a /stats nickname argument against the stats table (same
     * source !stats/!deanon use in-room). Multiple accounts can share a
     * nickname; when that happens and `index` wasn't given, returns
     * `choices` so the caller can render the disambiguation list and the
     * user re-runs the command with `index` filled in.
     */
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
            await interaction.reply({ embeds: [errorEmbed('public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        if (auth === caller.auth) {
            await interaction.reply({ embeds: [errorEmbed('Нельзя менять роль себе.')], ephemeral: true });
            return;
        }

        const account = await db.getAccount(auth);
        if (!account) {
            await interaction.reply({ embeds: [errorEmbed('Аккаунт с таким public_id не найден.')], ephemeral: true });
            return;
        }

        let date = null;
        if (timeArg) {
            const parsed = parseTimeArg(timeArg);
            if (!parsed) {
                await interaction.reply({ embeds: [errorEmbed('Некорректный формат времени, пример: `30d`, `12h`.')], ephemeral: true });
                return;
            }
            date = Date.now() + parsed.ms;
        }

        db.setRole(auth, roleName, date);

        await applyModeration({type: 'roleUpdate', auth, roleName});

        await interaction.reply({
            embeds: [okEmbed(`✅ ${account.nickname} теперь **${roleName.toUpperCase()}**${date ? ` до <t:${Math.floor(date / 1000)}:f>` : ' (бессрочно)'}.`)]
        });
    }

    async function handleGetRoleList(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        const roleName = interaction.options.getString('role');
        const accounts = db.getAccountsByRole(roleName);

        let description = 'Пусто.';
        if (accounts.length > 0) {
            const header = `№   | ${"Никнейм".padEnd(18)} | ${"Auth".padEnd(45)}\n` +
               `${"-".repeat(4)}|${"-".repeat(20)}|${"-".repeat(47)}\n`;
                        
            const rows = accounts.map((a, i) => {
                const num = `${i + 1}.`.padEnd(3);
                const name = (a.nickname ?? "UNKNOWN").substring(0, 18).padEnd(18);
                const auth = String(a.auth).substring(0, 20).padEnd(20);
                
                return `${num} | ${name} | ${auth}`;
            }).join('\n');

            description = `\`\`\`text\n${header}${rows}\n\`\`\` \n`;
        }

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`${roleName.toUpperCase()} — ${accounts.length}`)
            .setDescription(description.slice(0, 4000));

        await interaction.reply({ embeds: [embed] });
    }

    async function handlePassword(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        const room = interaction.options.getString('room');
        const value = interaction.options.getString('value');

        const applied = await applyToRoom(room, { type: 'password', value: value || null });

        if (!applied) {
            await interaction.reply({ embeds: [errorEmbed(`Комната **${room}** сейчас недоступна (не запущена).`)], ephemeral: true });
            return;
        }

        await interaction.reply({
            embeds: [okEmbed(value
                ? `✅ Пароль комнаты **${room}** установлен: \`${value}\`.`
                : `✅ Пароль комнаты **${room}** сброшен.`)]
        });
    }

    async function handleStatsClear(interaction) {
        const caller = await requireLinkedRole(interaction, Role.MASTER);
        if (!caller) return;

        await interaction.deferReply();

        const backup = db.backupStats();
        db.clearStats();

        if (backup.count > 0) {
            discordBotSend.sendStatsBackup(BROADCAST_ROOM_LABEL, backup.filePath, backup.filename);
        }

        const payload = {
            embeds: [okEmbed(`✅ Статистика сброшена. Бекап: \`${backup.filename}\`, записей: ${backup.count}.`)]
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
            await interaction.reply({ embeds: [errorEmbed('public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const account = await db.getAccount(auth);
        const targetRole = RoleString[account?.role] ?? Role.PLAYER;

        if (auth === caller.auth || (targetRole >= Role.PREADMIN && caller.role !== Role.MASTER)) {
            await interaction.reply({ embeds: [errorEmbed('Нельзя забанить себя или игрока с защитой от бана.')], ephemeral: true });
            return;
        }

        const parsed = parseTimeArg(timeArg);
        if (!parsed) {
            await interaction.reply({ embeds: [errorEmbed('Некорректный формат времени, пример: `10min`, `1d`.')], ephemeral: true });
            return;
        }

        const existingBans = db.getBans();
        db.addBan({
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

        const targetDisplay = account?.nickname ?? auth;

        discordBotSend.sendReport(BROADCAST_ROOM_LABEL, caller.nickname, targetDisplay, 'ban', reason || null, parsed.label);

        await interaction.reply({
            embeds: [okEmbed(
                `✅ ${targetDisplay} забанен на ${parsed.label}${reason ? ` по причине: ${reason}` : ''}.\n` +
                (appliedLive ? '🔴 Игрок был в комнате — кикнут немедленно.' : 'Игрока сейчас нет в комнате — бан применится при следующем заходе.')
            )]
        });
    }

    async function handleUnban(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed('public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const ban = db.removeBanByAuth(auth);

        if (!ban) {
            await interaction.reply({ embeds: [errorEmbed('Этот public_id не найден в бан-листе.')], ephemeral: true });
            return;
        }

        await applyModeration({ type: 'unban', auth, unban_id: ban.id ?? null});

        const targetDisplay = ban.name ?? ban.auth;
        discordBotSend.sendReport(BROADCAST_ROOM_LABEL, caller.nickname, targetDisplay, 'unban', null, null);

        await interaction.reply({ embeds: [okEmbed(`✅ ${targetDisplay} разбанен.`)] });
    }

    async function handleMute(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');
        const timeArg = interaction.options.getString('time');
        const reason = interaction.options.getString('reason');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed('public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const account = await db.getAccount(auth);
        const targetRole = RoleString[account?.role] ?? Role.PLAYER;

        if (targetRole >= Role.PREADMIN && caller.role !== Role.MASTER) {
            await interaction.reply({ embeds: [errorEmbed('У игрока защита от мута.')], ephemeral: true });
            return;
        }

        const parsed = parseTimeArg(timeArg);
        if (!parsed) {
            await interaction.reply({ embeds: [errorEmbed('Некорректный формат времени, пример: `10min`, `1h`.')], ephemeral: true });
            return;
        }

        const existing = db.getMuteByAuth(auth);
        if (existing) {
            db.removeMuteByAuth(auth);
        }

        const mutes = db.getMutes();
        const unmuteDate = Date.now() + parsed.ms;
        const targetDisplay = account?.nickname ?? auth;

        db.addMute({
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
            embeds: [okEmbed(
                `✅ ${targetDisplay} замучен на ${parsed.label}${reason ? ` по причине: ${reason}` : ''}.\n` +
                (appliedLive ? '🔴 Игрок был в комнате — мут вступил в силу немедленно.' : 'Игрока сейчас нет в комнате — мут применится при следующем заходе.')
            )]
        });
    }

    async function handleUnmute(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const auth = interaction.options.getString('public_id');

        if (!isValidAuth(auth)) {
            await interaction.reply({ embeds: [errorEmbed('public_id должен быть строкой из 43 символов.')], ephemeral: true });
            return;
        }

        const removed = db.removeMuteByAuth(auth);
        if (!removed) {
            await interaction.reply({ embeds: [errorEmbed('Этот игрок не в муте.')], ephemeral: true });
            return;
        }

        const appliedLive = await applyModeration({ type: 'unmute', auth });

        const account = await db.getAccount(auth);
        const targetDisplay = account?.nickname ?? auth;

        discordBotSend.sendReport(BROADCAST_ROOM_LABEL, caller.nickname, targetDisplay, 'unmute', null, null);

        await interaction.reply({
            embeds: [okEmbed(`✅ ${targetDisplay} размучен.` + (appliedLive ? ' Применено немедленно.' : ''))]
        });
    }

    async function handleBans(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const bans = db.getBans();
        
        let description = 'Пусто.';
        if (bans.length > 0) {
            const header = `№   | ${"Имя".padEnd(18)} | ${"Auth".padEnd(45)} | Время\n` +
               `${"-".repeat(4)}|${"-".repeat(20)}|${"-".repeat(47)}|${"-".repeat(9)}\n`;
                        
            const rows = bans.map((b, i) => {
                const mins = Math.max(0, Math.round((b.date - Date.now()) / 1000 / 60));
                const num = `${i + 1}.`.padEnd(3);
                const name = (b.name ?? "UNKNOWN").substring(0, 15).padEnd(15);
                const auth = String(b.auth).substring(0, 20).padEnd(20);
                const time = `${mins}м`;
                
                return `${num} | ${name} | ${auth} | ${time}`;
            }).join('\n');

            description = `\`\`\`text\n${header}${rows}\n\`\`\``;
        }

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`Бан-лист — ${bans.length}`)
            .setDescription(description.slice(0, 4000));

        await interaction.reply({ embeds: [embed] });
    }

    async function handleMutes(interaction) {
        const caller = await requireLinkedRole(interaction, Role.ADMIN);
        if (!caller) return;

        const mutes = db.getMutes();
        
        let description = 'Пусто.';
        if (mutes.length > 0) {
            const header = `№   | ${"Имя".padEnd(18)} | ${"Auth".padEnd(45)} | Время\n` +
               `${"-".repeat(4)}|${"-".repeat(20)}|${"-".repeat(47)}|${"-".repeat(9)}\n`;
                        
            const rows = mutes.map((m, i) => {
                const mins = Math.max(0, Math.round((m.unmuteDate - Date.now()) / 1000 / 60));
                const num = `${i + 1}.`.padEnd(3);
                const name = (m.name ?? "UNKNOWN").substring(0, 15).padEnd(15);
                const auth = String(m.auth).substring(0, 20).padEnd(20);
                const time = `${mins}м`;
                
                return `${num} | ${name} | ${auth} | ${time}`;
            }).join('\n');

            description = `\`\`\`text\n${header}${rows}\n\`\`\``;
        }

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`Мут-лист — ${mutes.length}`)
            .setDescription(description.slice(0, 4000));

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

        const list = db.getTopStats(len); 
        if (list.length < len) {
            await interaction.reply({ embeds: [errorEmbed(`Недостаточно игроков в топе: ещё ${len - list.length}.`)], ephemeral: true });
            return;
        }

        const buildTopTable = (key) => {
            const idx = TOPS[key];
            const sorted = [...list].sort((a, b) => b[idx] - a[idx]);
            
            const header = `№   | ${"Никнейм".padEnd(18)} | Значение\n` +
               `${"-".repeat(4)}|${"-".repeat(20)}|${"-".repeat(9)}\n`;

            const rows = sorted.slice(0, len).map((s, i) => {
                const num = `${i + 1}.`.padEnd(3);
                const name = String(s[0]).substring(0, 18).padEnd(18);
                const value = key === 'time' ? `${(s[idx] / 60).toFixed(1)}ч` : s[idx];
                const formattedValue = String(value).padEnd(8);

                return `${num} | ${name} | ${formattedValue}`;
            }).join('\n');

            return `\`\`\`text\n${header}${rows}\`\`\``;
        };

        const buildTopLines = (key) => {
            const idx = TOPS[key];
            const sorted = [...list].sort((a, b) => b[idx] - a[idx]);
            return sorted.slice(0, len).map((s, i) => {
                const value = key === 'time' ? `${(s[idx] / 60).toFixed(1)}ч` : s[idx];
                return `\`${i + 1}.\` ${s[0]} — **${value}**`;
            });
        };

        if (statKey === 'all') {
            const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Топы игроков');
            for (const key of Object.keys(TOPS)) {
                embed.addFields({ name: `🏆 Топ по ${key}`, value: buildTopLines(key).join('\n').slice(0, 1024) });
            }
            await interaction.reply({ embeds: [embed] });
            return;
        }

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(`📊 Статистика: ${statKey.toUpperCase()}`)
                    .setDescription(buildTopTable(statKey))
            ]
        });
    }

    async function handleStats(interaction) {
        const caller = await requireLinkedRole(interaction, Role.PLAYER);
        if (!caller) return;

        const nickname = interaction.options.getString('nickname');
        const index = interaction.options.getInteger('index');

        let stat;

        if (!nickname) {
            stat = db.getStat(caller.auth);
        } else {
            const resolved = await resolveStatsByNickname(nickname, index);

            if (resolved.error) {
                await interaction.reply({ embeds: [errorEmbed(resolved.error)], ephemeral: true });
                return;
            }

            if (resolved.choices) {
                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle(`Найдено ${resolved.choices.length} игроков с ником "${nickname}"`)
                        .setDescription(
                            `${formatChoices(resolved.choices)}\n\n` +
                            `Повторите команду с аргументом \`index\`, чтобы выбрать нужного.`
                        )]
                });
                return;
            }

            stat = resolved.stat;
        }

        if (!stat) {
            await interaction.reply({ embeds: [errorEmbed('Статистика не найдена — нужно сыграть хотя бы одну игру.')], ephemeral: true });
            return;
        }

        await interaction.reply({
            embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle(`📊 ${stat[0]}`).setDescription(formatStats(stat))]
        });
    }

    async function handleAccount(interaction) {
        const caller = await requireLinkedRole(interaction, Role.PLAYER);
        if (!caller) return;

        const publicId = interaction.options.getString('public_id');

        if (publicId && caller.role < Role.ADMIN) {
            await interaction.reply({ embeds: [errorEmbed('Смотреть чужие аккаунты могут только ADMIN и выше.')], ephemeral: true });
            return;
        }

        let targetAuth = caller.auth;
        if (publicId) {
            if (!isValidAuth(publicId)) {
                await interaction.reply({ embeds: [errorEmbed('public_id должен быть строкой из 43 символов.')], ephemeral: true });
                return;
            }
            targetAuth = publicId;
        }

        const account = await db.getAccount(targetAuth);
        if (!account) {
            await interaction.reply({ embeds: [errorEmbed('Аккаунт не найден.')], ephemeral: true });
            return;
        }

        const toDate = account.date != null ? `<t:${Math.floor(account.date / 1000)}:f>` : 'бессрочно';
        const discordField = account.discord ? `<@${account.discord}>` : 'не привязан';

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`📋 ${account.nickname}`)
            .setDescription(
                `**public_id:** \`${targetAuth}\`\n` +
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
            const payload = { embeds: [errorEmbed('Произошла ошибка при выполнении команды.')], ephemeral: true };
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