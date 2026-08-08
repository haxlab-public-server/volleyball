module.exports = function createPlayerCommands({
    room,
    state,
    fs,
    getAuth,
    getRole,
    getOnlyInt,
    getTeamArray,
    sendAnnouncementTeam,
    getStatTime,
    updateTeams,
    updateTeamSize,
    getCommands,
    Role,
    Mods,
    Team,
    Color,
    HaxNotification,
    Discord,
    Telegram,
    vipQueueRoles
}) {
    function loadJson(filename) {
        // TODO: migrate from fs to sqlite in the future
        return JSON.parse(fs.readFileSync(filename, 'utf8'));
    }

    function saveJson(filename, data) {
        // TODO: migrate from fs to sqlite in the future
        fs.writeFileSync(filename, JSON.stringify(data));
    }

    function parsePlayerId(arg) {
        const idStr = arg.startsWith('#') ? arg.slice(1) : arg;
        const id = Number(idStr);
        return Number.isInteger(id) && id >= 0 ? id : null;
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

        return (
            `📊${stat[0]} - Игры: ${games}, Победы: ${wins} (${winRate}%), ` +
            `Голы: ${goals}, ПОБ: ${pob}% (из ${goals + blocked}), ` +
            `Блоки: ${blocks}, Пасы: ${assists}, Ошибки: ${errors} (${errPerGame}/игра), ` +
            `Подачи: ${serves}, ЭЙСы: ${aces} (${aceRate}%), Время: ${getStatTime(time)}` +
            `\nПОБ - Процент Обойдённых Блоков (чем ниже процент, тем больше ваших атак было заблокированно)`
        );
    }

    function teamChatCommand(player, message) {
        const text = message.split(/ +/).slice(1).join(' ');
        const emoji = player.team === 1 ? '🔴' : player.team === 2 ? '🔵' : '⚪';
        const color = player.team === 1
            ? Color.TEAM_RED
            : player.team === 2
            ? Color.TEAM_BLUE
            : null;

        sendAnnouncementTeam(
            `${emoji} [TEAM] ${player.name}: ${text}`,
            getTeamArray(player.team),
            color,
            'bold',
            1
        );
    }

    function helpCommand(player) {
        const commands = getCommands();
        const available = Object.entries(commands)
            .filter(([, cmd]) => cmd.roles <= getRole(player))
            .map(([key]) => `!${key}`);

        room.sendAnnouncement(
            `Доступные вам команды: ${available.join(', ')}.`,
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    function admCommand(player) {
        player.auth = getAuth(player.id);
        const role = getRole(player);
        const hasAdmin = room.getPlayerList().some(p => p.admin);

        if (state.mode === Mods.PRIVATE) {
            if (role >= Role.VIP || (role < Role.VIP && !hasAdmin)) {
                room.setPlayerAdmin(player.id, true);
            }
        } else if (role >= Role.PREADMIN) {
            room.setPlayerAdmin(player.id, true);
        }
    }

    function serveCommand(player) {
        if (state.training_mode) {
            room.sendAnnouncement(
                `Чтобы тренировать подачу в тренинг моде используй !bs serve_red или !bs serve_blue`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.MENTION
            );
            return;
        }

        if (player.team === Team.SPECTATORS) {
            room.sendAnnouncement(
                `Вы должны быть в игре, чтобы сделать подачу`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.MENTION
            );
            return;
        }

        if (
            getTeamArray(Team.BLUE).length < state.game.teamSize ||
            getTeamArray(Team.RED).length < state.game.teamSize
        ) {
            room.sendAnnouncement(
                `Недостаточно игроков на поле для силовой подачи`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.MENTION
            );
            return;
        }

        if (state.lastTouches[0] !== undefined) {
            room.sendAnnouncement(
                `Сейчас нельзя сделать подачу`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.MENTION
            );
            return;
        }

        if (state.serveBall) {
            room.sendAnnouncement(
                `Кто-то уже делает подачу`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.MENTION
            );
            return;
        }

        if (player.team !== state.serve) {
            room.sendAnnouncement(
                `Сейчас не ваша подача`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.MENTION
            );
            return;
        }

        const isBlue = player.team === Team.BLUE;
        setTimeout(() => {
            state.serveBall = true;
            room.setDiscProperties(0, {
                x: isBlue ? 410 : -410,
                y: 200,
                xspeed: isBlue ? -0.7 : 0.7,
                yspeed: -11.9
            });
        }, 300);
    }

    function bbCommand(player) {
        room.kickPlayer(player.id, 'Пока!', false);
    }

    function statsCommand(player, message) {
        const args = message.split(/ +/).slice(1);
        const stats = loadJson('stats.json');

        if (args.length === 0) {
            const stat = stats[getAuth(player.id)];
            if (!stat) {
                room.sendAnnouncement(
                    `Вас нет в статистике сыграйте хотя бы одну игру!`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }
            room.sendAnnouncement(
                formatStats(stat),
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const arg = args[0];

        if (!arg.startsWith('@')) {
            const id = parsePlayerId(arg);
            if (id === null) {
                room.sendAnnouncement(
                    `Некорректный параметр, введите айди игрока если он на сервере или его @никнейм`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            const target = room.getPlayer(id);
            if (!target) {
                room.sendAnnouncement(
                    `Игрок должен быть на сервере, чтобы вы могли посмотреть его статистику`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            const stat = stats[getAuth(id)];
            if (!stat) {
                room.sendAnnouncement(
                    `Вас нет в статистике сыграйте хотя бы одну игру!`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }

            room.sendAnnouncement(
                formatStats(stat),
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const pname = arg.slice(1).replace(/_/g, ' ').toLowerCase();
        const matches = Object.entries(stats)
            .filter(([, s]) => s[0].toLowerCase().replace(/_/g, ' ') === pname);

        if (matches.length === 0) {
            room.sendAnnouncement(
                `Игрока с таким именем нет в статистике`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        if (matches.length > 1 && (args[1] === undefined || isNaN(args[1]))) {
            const deanon = loadJson('nicknames.json');
            const names = matches
                .map(([auth], i) => `${i + 1}) ${deanon[auth] ?? auth}`)
                .join('\n');

            room.sendAnnouncement(
                `Игроков с таким именем в статистике ${matches.length}, введите команду ещё раз, но после имени введите номер нужного вам\nВот их имена из deanon команды:\n${names}`,
                player.id,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const index = matches.length === 1 ? 0 : Number(args[1]) - 1;
        const [, stat] = matches[index] ?? [];

        if (!stat) {
            room.sendAnnouncement(
                `Игрока нет в статистике он должен сыграть хотя бы одну игру!`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            formatStats(stat),
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    function renameCommand(player, message) {
        const args = message.split(/ +/).slice(1);
        const stats = loadJson('stats.json');
        const auth = getAuth(player.id);

        if (!stats[auth]) {
            room.sendAnnouncement(
                `Ошибка!`,
                player.id,
                Color.GR_RED,
                'bold',
                HaxNotification.CHAT
            );
            return;
        }

        stats[auth][0] = args.length === 0 ? player.name : args.join(' ');
        saveJson('stats.json', stats);

        room.sendAnnouncement(
            `Вы успешно переименовали себя ${stats[auth][0]} !`,
            player.id,
            Color.GR_GREEN,
            'bold',
            HaxNotification.CHAT
        );
    }

    const TOPS = {
        games: 1,
        wins: 2,
        goals: 3,
        blocks: 4,
        assists: 5,
        aces: 8,
        time: 10
    };

    function topsCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0) {
            room.sendAnnouncement(
                `Некорректный топ: "games", "wins", "goals", "blocks", "assists", "aces", "time"\nПример - !tops goals`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const top = args[0].toLowerCase();
        if (!(top in TOPS)) {
            room.sendAnnouncement(
                `Некорректный топ: "games", "wins", "goals", "blocks", "assists", "aces", "time"\nПример - !tops goals`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        let len = 10;
        if (args.length >= 2) {
            len = Number(args[1]);
            if (len < 5 || len > 50) {
                room.sendAnnouncement(
                    `Некорректная длина топа, min: 5 max: 50`,
                    player.id,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
                return;
            }
        }

        const stats = loadJson('stats.json');
        const list = Object.values(stats).filter(s => s[1] >= 5);

        if (list.length < len) {
            room.sendAnnouncement(
                `Недостаточно игроков в топе: ещё ${len - list.length}`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        list.sort((a, b) => b[TOPS[top]] - a[TOPS[top]]);

        const lines = list.slice(0, len).map((s, i) => {
            const value = top === 'time' ? getStatTime(s[TOPS[top]]) : s[TOPS[top]];
            return `${i + 1}. ${s[0]} (${value})`;
        });

        room.sendAnnouncement(
            `${top} - ${lines.join(' ')}`,
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    function getAuthCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0) {
            room.sendAnnouncement(
                `${player.name} ID: ${getAuth(player.id)}`,
                player.id,
                Color.WH_BLUE,
                'small-italic',
                HaxNotification.CHAT
            );
            return;
        }

        const id = parsePlayerId(args[0]);
        if (id === null) {
            room.sendAnnouncement(
                `Неверный формат! ("!getauth #ID")`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const target = room.getPlayer(id);
        if (!target) {
            room.sendAnnouncement(
                `Игрока с таким ID не существует`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        room.sendAnnouncement(
            `${target.name} ID: ${getAuth(target.id)}`,
            player.id,
            Color.WH_BLUE,
            'small-italic',
            HaxNotification.CHAT
        );
    }

    function queueCommand(player) {
        if (state.queue.length === 0) {
            room.sendAnnouncement(
                `📝В очереди никого нет`,
                player.id,
                Color.GR_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const sorted = [...state.queue].sort((a, b) => b[1] - a[1]);
        const realQueue = sorted.filter(
            ([id]) => state.afkList.findIndex(p => p[0] === id) === -1
        );
        const vipQueue = realQueue.filter(
            ([id]) => vipQueueRoles.includes(getRole(room.getPlayer(id)))
        );

        let result = realQueue.length > 0
            ? `📝Очередь (игрок [пропущ. игр]): ${realQueue.map(([id, missed]) => `${room.getPlayer(id).name} [${missed}]`).join(', ')}.`
            : '📝В очереди никого нет';

        result += vipQueue.length > 0
            ? `\n🌟VIP-Очередь (игрок [пропущ. игр]): ${vipQueue.map(([id, missed]) => `${room.getPlayer(id).name} [${missed}]`).join(', ')}.`
            : '\n🌟В VIP-Очереди никого нет';

        room.sendAnnouncement(
            result,
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    function discordCommand(player) {
        room.sendAnnouncement(
            `Наш discord: ${Discord}`,
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    function telegramCommand(player) {
        room.sendAnnouncement(
            `Мой telegram: ${Telegram}`,
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    function afkCommand(player) {
        const index = state.afkList.findIndex(p => p[0] === player.id);

        if (index !== -1) {
            state.afkList = state.afkList.filter(p => p[0] !== player.id);
            room.sendAnnouncement(
                `🐣${player.name} больше не АФК`,
                null,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
        } else {
            if (player.team !== Team.SPECTATORS) {
                room.setPlayerTeam(player.id, Team.SPECTATORS);
            }
            state.afkList.push([player.id, player.name, Date.now()]);
            if (state.winstay_mode && state.winstay.team.includes(player)) {
                room.sendAnnouncement(
                    `СТРИК БЫЛ СБРОШЕН`,
                    null,
                    Color.WH_BLUE,
                    'small',
                    HaxNotification.MENTION
                );
                state.winstay = {
                    streak: 0,
                    team: [],
                }
            }
            room.sendAnnouncement(
                `💤${player.name} теперь АФК`,
                null,
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
        }

        updateTeams();
        updateTeamSize();
    }

    function afkListCommand(player) {
        if (state.afkList.length === 0) {
            room.sendAnnouncement(
                `💤В списке АФК никого нет`,
                player.id,
                Color.GR_GREEN,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const lines = state.afkList.map(
            ([, name, time]) => `${name} (${Math.ceil((Date.now() - time) / 1000 / 60)}мин)`
        );

        room.sendAnnouncement(
            `💤Список АФК: ${lines.join(', ')}.`,
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    function idsCommand(player) {
        const lines = room.getPlayerList().map(p => `${p.name} (${p.id})`);
        room.sendAnnouncement(
            `📑player (id): ${lines.join(', ')}.`,
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.CHAT
        );
    }

    function deanonCommand(player, message) {
        const args = message.split(/ +/).slice(1);

        if (args.length === 0) {
            room.sendAnnouncement(
                `Напишите айди игрока`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const id = parsePlayerId(args[0]);
        if (id === null) {
            room.sendAnnouncement(
                `Игрока нет на сервере`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const target = room.getPlayer(id);
        if (!target) {
            room.sendAnnouncement(
                `Игрока нет на сервере`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const deanon = loadJson('nicknames.json');
        const auth = getAuth(target.id);

        if (!(auth in deanon)) {
            room.sendAnnouncement(
                `Ошибка, невозможно узнать имена игрока`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const names = deanon[auth].join(', ');
        room.sendAnnouncement(
            `🔍${target.name} также известен как: ${names}.`,
            player.id,
            null,
            'small',
            HaxNotification.CHAT
        );
    }

    function myPointCommand(player) {
        if (player.team === Team.SPECTATORS || room.getScores() == null) {
            room.sendAnnouncement(
                `Команду можно использовать только на поле`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
            return;
        }

        const prop = room.getPlayerDiscProperties(player.id);
        room.sendAnnouncement(
            `x: ${+prop.x.toFixed(2)} y: ${+prop.y.toFixed(2)}`,
            player.id,
            Color.WH_BLUE,
            'small',
            HaxNotification.CHAT
        );
    }

    return {
        teamChatCommand,
        helpCommand,
        admCommand,
        serveCommand,
        bbCommand,
        statsCommand,
        renameCommand,
        topsCommand,
        getAuthCommand,
        queueCommand,
        discordCommand,
        telegramCommand,
        afkCommand,
        afkListCommand,
        idsCommand,
        deanonCommand,
        myPointCommand
    };
};