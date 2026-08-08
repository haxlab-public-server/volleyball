module.exports = function createMovementEvents({
    room,
    state,
    lastIds,
    fs,
    getAuth,
    getConn,
    getRole,
    updateVipSlots,
    updateTeams,
    updateTeamSize,
    GhostKick,
    Role,
    Team,
    Mods,
    Color,
    HaxNotification,
    Discord,
    Telegram,
    maxPlayers,
    discordBot
}) {
    function loadJson(filename) {
        // TODO: migrate from fs to sqlite in the future
        return JSON.parse(fs.readFileSync(filename, 'utf8'));
    }

    function saveJson(filename, data) {
        // TODO: migrate from fs to sqlite in the future
        fs.writeFileSync(filename, JSON.stringify(data));
    }

    const ROLE_NAMES = {
        [Role.MASTER]: 'Создатель',
        [Role.ADMIN]: 'Администратор',
        [Role.PREADMIN]: 'Мл. Администратор',
        [Role.VIP]: 'VIP'
    };

    function onPlayerJoin(player) {
        lastIds[player.auth] = [player.id, player.conn, player.auth];

        if (GhostKick && room.getPlayerList().length > 1) {
            const alreadyOnline = room.getPlayerList()
                .filter(p => p.id !== player.id)
                .some(p => getConn(p.id) === player.conn);

            if (alreadyOnline) {
                room.kickPlayer(player.id, 'Кажется ты уже есть в комнате', false);
                return;
            }
        }

        const accounts = loadJson('accounts.json');
        if (accounts[player.auth] == null) {
            accounts[player.auth] = {
                nickname: player.name,
                role: 'player',
                date: null,
                discord: null,
                chat_color: null
            };
        } else {
            accounts[player.auth].nickname = player.name;
        }
        saveJson('accounts.json', accounts);

        const banList = loadJson('bans.json');
        const banIndex = banList.findIndex(
            p => p.auth === player.auth || p.conn === player.conn
        );

        if (banIndex !== -1) {
            const ban = banList[banIndex];
            ban.id = player.id;
            ban.name = player.name;
            ban.conn = player.conn;
            ban.auth = player.auth;
            saveJson('bans.json', banList);

            const minsLeft = Math.round((ban.date - Date.now()) / 1000 / 60);
            setTimeout(() => {
                room.kickPlayer(
                    player.id,
                    `Вы забанены: ${minsLeft} мин\n discord: ${Discord}\n telegram: ${Telegram}`,
                    true
                );
            }, 700);
            return;
        }

        if (state.joinAuths && getRole(player) < Role.ADMIN) {
            const auths = loadJson('auths.json');
            if (!auths.includes(player.auth)) {
                setTimeout(() => {
                    room.kickPlayer(
                        player.id,
                        `Сейчас в комнату могут зайти только авторизованные игроки\n discord: ${Discord}\n telegram: ${Telegram}`,
                        false
                    );
                }, 700);
            }
        }

        state.inactivityTicks[player.id] = 0;
        state.queue.push([player.id, 0]);

        const deanon = loadJson('nicknames.json');
        if (player.auth in deanon) {
            if (!deanon[player.auth].includes(player.name)) {
                deanon[player.auth].push(player.name);
            }
        } else {
            deanon[player.auth] = [player.name];
        }
        saveJson('nicknames.json', deanon);

        const stats = loadJson('stats.json');
        if (stats[player.auth] == null) {
            stats[player.auth] = [player.name, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            saveJson('stats.json', stats);
        }

        const role = getRole(player);
        const roleName = ROLE_NAMES[role];

        if (role >= Role.ADMIN) {
            room.setPlayerAdmin(player.id, true);
            room.sendAnnouncement(
                `💥 ${roleName} ${player.name} зашёл на комнату!`,
                null,
                Color.RED,
                'bold',
                HaxNotification.CHAT
            );
        } else if (role === Role.VIP) {
            if (state.mode === Mods.PRIVATE) {
                room.setPlayerAdmin(player.id, true);
            }
            room.sendAnnouncement(
                `🌟 ${roleName} ${player.name} зашёл на комнату!`,
                null,
                Color.PINK,
                'bold',
                HaxNotification.CHAT
            );
        } else if (role === Role.PREADMIN) {
            room.setPlayerAdmin(player.id, true);
            room.sendAnnouncement(
                `💢 ${roleName} ${player.name} зашёл на комнату!`,
                null,
                Color.RED,
                'bold',
                HaxNotification.CHAT
            );
        }

        room.sendAnnouncement(
            `Заходи на наш discord-сервер: ${Discord}\nПодписывайся на мой telegram: ${Telegram}\nНапиши "!help" чтобы узнать список доступных команд.\nНапиши перед сообщением "ч", чтобы писать в чат команды\nПо всем вопросам tg: chesdes`,
            player.id,
            Color.GR_GREEN,
            'small',
            HaxNotification.NONE
        );

        updateVipSlots();
        updateTeams();
        updateTeamSize();

        discordBot.sendLog(
            `${player.auth} / ${player.conn} | **${player.name}** join ${room.getPlayerList().length}/${maxPlayers}`
        );
    }

    function onPlayerLeave(player) {
        state.queue = state.queue.filter(p => p[0] !== player.id);
        state.afkList = state.afkList.filter(p => p[0] !== player.id);
        state.inactivityTicks[player.id] = 0;

        player.auth = getAuth(player.id);

        room.sendAnnouncement(
            `${player.name} ID: ${player.auth}`,
            null,
            Color.GR_GREEN,
            'small',
            HaxNotification.NONE
        );

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

        updateVipSlots();
        updateTeams();
        updateTeamSize();

        discordBot.sendLog(
            `[${player.auth}] **${player.name}** leave ${room.getPlayerList().length}/${maxPlayers}`
        );
    }

    function onPlayerKicked(kickedPlayer, reason, ban, byPlayer) {
        if (byPlayer != null) {
            const byRole = getRole(byPlayer);
            const kickedRole = getRole(kickedPlayer);

            if ((ban && byRole < Role.MASTER) || kickedPlayer.id === byPlayer.id) {
                room.clearBan(kickedPlayer.id);
                room.setPlayerAdmin(byPlayer.id, false);
            }
            else if (
                (ban && byRole <= kickedRole) ||
                (kickedPlayer.id !== byPlayer.id && byRole < Role.MASTER)
            ) {
                room.setPlayerAdmin(byPlayer.id, false);
            }
        }

        discordBot.sendLog(
            `[${kickedPlayer.auth}] **${kickedPlayer.name}** was ${ban ? 'banned' : 'kicked'} by **${byPlayer.name}** | ${byPlayer.auth} / ${byPlayer.conn}`
        );
    }

    function onPlayerTeamChange(changedPlayer, byPlayer) {
        if (
            state.afkList.some(p => p[0] === changedPlayer.id) &&
            changedPlayer.team !== Team.SPECTATORS
        ) {
            room.setPlayerTeam(changedPlayer.id, Team.SPECTATORS);
            room.sendAnnouncement(
                `${changedPlayer.name} АФК!`,
                byPlayer?.id,
                Color.GR_RED,
                'small',
                HaxNotification.MENTION
            );
            return;
        }

        state.inactivityTicks[changedPlayer.id] = 0;

        const queueIdx = state.queue.findIndex(p => p[0] === changedPlayer.id);
        if (queueIdx !== -1) {
            state.queue[queueIdx][1] = 0;
        }

        if (changedPlayer.team !== Team.SPECTATORS && byPlayer == null) {
            room.sendAnnouncement(
                `@${changedPlayer.name} ты в игре!`,
                changedPlayer.id,
                Color.WH_BLUE,
                'bold',
                HaxNotification.MENTION
            );
        }
    }

    return {
        onPlayerJoin,
        onPlayerLeave,
        onPlayerKicked,
        onPlayerTeamChange
    };
};