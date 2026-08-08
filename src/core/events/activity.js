module.exports = function createActivityEvents({
    room,
    state,
    cf,
    fs,
    muteArray,
    getAuth,
    getRole,
    getCommand,
    commands,
    getTeamArray,
    sendAnnouncementTeam,
    getChatColor,
    teamChatCommand,
    defaultTeamSize,
    Role,
    Team,
    Mods,
    Color,
    HaxNotification,
    discordBot
}) {

function onPlayerChat(player, message) {
    discordBot.sendLog(`[${player.auth}] **${player.name}**: ${message}`);
    const msgArray = message.split(/ +/);
    state.inactivityTicks[player.id] = 0;

    if (msgArray[0][0] === '!') {
        const command = getCommand(msgArray[0].slice(1).toLowerCase());

        if (command !== false && commands[command].roles <= getRole(player)) {
            commands[command].function(player, message);
        } else {
            room.sendAnnouncement(
                `Команда, которую вы пытались ввести, для вас не существует. Пожалуйста, введите '!help', чтобы получить доступные команды.`,
                player.id,
                Color.GR_RED,
                'small',
                HaxNotification.CHAT
            );
        }
        return false;
    }

    if (!player.admin) {
        const mute = muteArray.getByAuth(getAuth(player.id));
        if (mute != null) {
            const minsLeft = Math.round((mute.unmuteDate - Date.now()) / 1000 / 60);

            room.sendAnnouncement(
                `Вы в муте: ${minsLeft}мин (ваши сообщения видят админы)`,
                player.id,
                Color.GR_RED,
                'bold',
                HaxNotification.MENTION
            );

            sendAnnouncementTeam(
                `*MUTED* ${player.name} (${player.id}): ${message}`,
                room.getPlayerList().filter(plr => getRole(plr) >= Role.PREADMIN),
                Color.GREY,
                null,
                HaxNotification.NONE
            );
            return false;
        }
    }

    const firstWord = msgArray[0].toLowerCase();
    if (firstWord === 'ч' || firstWord === 'x' || firstWord === 't') {
        teamChatCommand(player, message);
        return false;
    }

    const role = getRole(player);
    const rolePrefix = {
        [Role.MASTER]:   '[👑]',
        [Role.ADMIN]:    '[🛡]',
        [Role.PREADMIN]: '[♦️]',
        [Role.VIP]:      '[💎]'
    }[role] ?? '';

    const displayName = rolePrefix
        ? `${rolePrefix} ${player.name}`
        : player.name;

    const chatColor = getChatColor(player);
    const style = chatColor != null ? 'bold' : null;

    sendAnnouncementTeam(
        `${displayName} (${player.id}): ${message}`,
        room.getPlayerList().filter(plr => getRole(plr) >= Role.PREADMIN),
        chatColor,
        style,
        HaxNotification.CHAT
    );

    sendAnnouncementTeam(
        `${displayName}: ${message}`,
        room.getPlayerList().filter(plr => getRole(plr) < Role.PREADMIN),
        chatColor,
        style,
        HaxNotification.CHAT
    );

    return false;
}

function onPlayerBallKick(player) {
    const ballPos = room.getBallPosition();
    const teamColor = player.team === Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE;
    const enemyColor = player.team === Team.RED ? Color.TEAM_BLUE : Color.TEAM_RED;
    const isFullTeams = getTeamArray(Team.BLUE).length >= defaultTeamSize &&
                        getTeamArray(Team.RED).length >= defaultTeamSize &&
                        state.mode === Mods.PUBLIC;

    if (!state.goal_sit && state.serveBall) {
        room.sendAnnouncement(
            `🥏Силовая подача: ${player.name}`,
            null,
            teamColor,
            'bold',
            HaxNotification.CHAT
        );

        state.ball_color = 0x42f5d4;
        const disc = room.getDiscProperties(0);
        room.setDiscProperties(0, {
            cGroup: disc.cGroup ^ cf.kick,
            xspeed: disc.xspeed + Math.round(disc.xspeed / 1.5),
            color: state.ball_color
        });

        state.lastTouches.unshift([player.name, player.id, player.team, false, true]);

        if (isFullTeams) {
            const stats = JSON.parse(fs.readFileSync('stats.json', 'utf8'));
            stats[getAuth(player.id)][9]++;
            fs.writeFileSync('stats.json', JSON.stringify(stats));
        }
        return;
    }

    const isBlockZone =
        (ballPos.x > -100 && ballPos.y < 68 && player.team === Team.RED) ||
        (ballPos.x < 100 && ballPos.y < 68 && player.team === Team.BLUE);

    if (
        getTeamArray(player.team).length > 1 &&
        state.touches > 1 &&
        state.lastTouches[0] != null &&
        state.lastTouches[0][2] !== player.team &&
        isBlockZone
    ) {
        room.sendAnnouncement(
            `🛡️Блок: ${player.name}`,
            null,
            teamColor,
            'bold',
            HaxNotification.CHAT
        );

        state.touches = 0;
        state.ball_color = 0xffffff;
        state.lastTouches.unshift([player.name, player.id, player.team, true, false]);
        return;
    }

    if (
        state.lastTouches[0] != null &&
        state.lastTouches[0][1] === player.id &&
        getTeamArray(player.team).length > 1 &&
        state.touches >= 1
    ) {
        if (!state.goal_sit && !state.training_mode) {
            room.setDiscProperties(0, {
                xspeed: player.team === Team.RED ? -100 : 100,
                yspeed: 70
            });

            room.sendAnnouncement(
                `📛Двойное касание: ${player.name}`,
                null,
                enemyColor,
                'bold',
                HaxNotification.NONE
            );

            if (isFullTeams) {
                const stats = JSON.parse(fs.readFileSync('stats.json', 'utf8'));
                stats[getAuth(player.id)][7]++;
                fs.writeFileSync('stats.json', JSON.stringify(stats));
            }

            state.lastTouches = [];
            state.goal_sit = true;
        }
        return;
    }

    if (
        state.lastTouches[0] != null &&
        state.touches === 3 &&
        state.lastTouches[0][2] === player.team
    ) {
        if (!state.goal_sit && !state.training_mode) {
            room.setDiscProperties(0, {
                xspeed: player.team === Team.RED ? -100 : 100,
                yspeed: 70
            });

            room.sendAnnouncement(
                `📛4 касания: ${player.team === Team.RED ? 'красные' : 'синие'}`,
                null,
                enemyColor,
                'bold',
                HaxNotification.NONE
            );

            state.lastTouches = [];
            state.goal_sit = true;
        }
        return;
    }

    if (
        !state.goal_sit &&
        state.touches === 2 &&
        state.lastTouches[0] != null &&
        state.lastTouches[0][2] === player.team &&
        ballPos.y > 68
    ) {
        state.saveBall = true;
        state.ball_color = 0x03fc45;

        const disc = room.getDiscProperties(0);
        room.setDiscProperties(0, {
            cGroup: disc.cGroup ^ cf.kick,
            xspeed: disc.xspeed + Math.round(disc.xspeed / 2),
            color: state.ball_color
        });

        room.sendAnnouncement(
            `✳️Сейв-мяч`,
            null,
            teamColor,
            'bold',
            HaxNotification.CHAT
        );

        state.touches++;
        state.lastTouches.unshift([player.name, player.id, player.team, false, false]);
        return;
    }

    if (!state.goal_sit) {
        if (state.lastTouches[0] != null && state.lastTouches[0][2] === player.team) {
            state.touches++;
            switch (state.touches) {
                case 1: state.ball_color = 0xe0ca48; break;
                case 2: state.ball_color = 0xcc2929; break;
                default: state.ball_color = 0xffffff; break;
            }
        } else if (
            (state.lastTouches[0] != null && state.lastTouches[0][2] !== player.team) ||
            (state.touches > 3 && state.training_mode)
        ) {
            state.touches = 1;
            state.ball_color = 0xe0ca48;
        }
    }

    room.setDiscProperties(0, { color: state.ball_color });
    state.lastTouches.unshift([player.name, player.id, player.team, false, false]);
}

function onPlayerActivity(player) {
    if (state.mode == Mods.PUBLIC && !state.training_mode) {
        state.inactivityTicks[player.id] = 0
    }
}

return {
    onPlayerChat,
    onPlayerBallKick,
    onPlayerActivity
}

};