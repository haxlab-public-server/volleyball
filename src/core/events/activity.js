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
    discordBot,
    updateBallColor
}) {

    function getDisplayName(player) {
        const role = getRole(player);
        const prefix = {
            [Role.MASTER]:   '[👑]',
            [Role.ADMIN]:    '[🛡]',
            [Role.PREADMIN]: '[♦️]',
            [Role.VIP]:      '[💎]'
        }[role] ?? '';

        return prefix ? `${prefix} ${player.name}` : player.name;
    }

    function getTeamColor(team) {
        return team === Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE;
    }

    function getEnemyColor(team) {
        return team === Team.RED ? Color.TEAM_BLUE : Color.TEAM_RED;
    }

    function isFullPublicTeams() {
        return getTeamArray(Team.BLUE).length >= defaultTeamSize &&
               getTeamArray(Team.RED).length >= defaultTeamSize &&
               state.mode === Mods.PUBLIC;
    }

    function incrementStat(player, index) {
        if (!isFullPublicTeams()) return;
        // TODO: migrate from fs to sqlite in the future
        const stats = JSON.parse(fs.readFileSync('stats.json', 'utf8'));
        const auth = getAuth(player.id);
        if (stats[auth]) {
            stats[auth][index]++;
            // TODO: migrate from fs to sqlite in the future
            fs.writeFileSync('stats.json', JSON.stringify(stats));
        }
    }

    function onPlayerChat(player, message) {
        discordBot.sendLog(`[${getAuth(player.id)}] **${player.name}**: ${message}`);
        state.inactivityTicks[player.id] = 0;

        const msgArray = message.split(/ +/);
        const firstWord = msgArray[0]?.toLowerCase() || '';

        if (firstWord.startsWith('!')) {
            const commandName = firstWord.slice(1);
            const command = getCommand(commandName);

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
            if (mute) {
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
                    room.getPlayerList().filter(p => getRole(p) >= Role.PREADMIN),
                    Color.GREY,
                    null,
                    HaxNotification.NONE
                );
                return false;
            }
        }

        if (firstWord === 'ч' || firstWord === 'x' || firstWord === 't') {
            teamChatCommand(player, message);
            return false;
        }

        const displayName = getDisplayName(player);
        const chatColor = getChatColor(player);
        const style = chatColor != null ? 'bold' : null;

        const allPlayers = room.getPlayerList();
        const preAdmins = allPlayers.filter(p => getRole(p) >= Role.PREADMIN);
        const normals   = allPlayers.filter(p => getRole(p) < Role.PREADMIN);

        const isAllMention = getRole(player) >= Role.ADMIN && /@all\b/i.test(message);

        if (isAllMention) {
            sendAnnouncementTeam(
                `${displayName} (${player.id}): ${message}`,
                preAdmins,
                chatColor,
                'bold',
                HaxNotification.MENTION
            );

            sendAnnouncementTeam(
                `${displayName}: ${message}`,
                normals,
                chatColor,
                'bold',
                HaxNotification.MENTION
            );
        } else {
            const mentionedIds = new Set();
            const mentionRegex = /@([^\s@]+)/gi;
            let match;
            while ((match = mentionRegex.exec(message)) !== null) {
                const name = match[1].toLowerCase();
                const targets = allPlayers.filter(p => p.name.toLowerCase() === name);

                for (const target of targets) {
                    mentionedIds.add(target.id);
                }
            }

            for (const id of mentionedIds) {
                const isAdmin = preAdmins.some(p => p.id === id);
                const text = isAdmin
                    ? `${displayName} (${player.id}): ${message}`
                    : `${displayName}: ${message}`;

                room.sendAnnouncement(text, id, chatColor, 'bold', HaxNotification.MENTION);
            }

            const nonMentionedAdmins  = preAdmins.filter(p => !mentionedIds.has(p.id));
            const nonMentionedNormals = normals.filter(p => !mentionedIds.has(p.id));

            if (nonMentionedAdmins.length > 0) {
                sendAnnouncementTeam(
                    `${displayName} (${player.id}): ${message}`,
                    nonMentionedAdmins,
                    chatColor,
                    style,
                    HaxNotification.CHAT
                );
            }

            if (nonMentionedNormals.length > 0) {
                sendAnnouncementTeam(
                    `${displayName}: ${message}`,
                    nonMentionedNormals,
                    chatColor,
                    style,
                    HaxNotification.CHAT
                );
            }
        }

        return false;
    }

    function onPlayerBallKick(player) {
        const ballPos = room.getBallPosition();

        if (state.waitingForServe) {
            state.waitingForServe = false;
        }

        const teamColor = getTeamColor(player.team);
        const enemyColor = getEnemyColor(player.team);

        if (!state.goal_sit && state.serveBall) {
            room.sendAnnouncement(
                `🥏Силовая подача: ${player.name}`,
                null, teamColor, 'bold', HaxNotification.CHAT
            );

            const disc = room.getDiscProperties(0);
            room.setDiscProperties(0, {
                cGroup: disc.cGroup ^ cf.kick,
                xspeed: disc.xspeed + Math.round(disc.xspeed / 1.5),
                color: 0x42f5d4
            });

            state.lastTouches.unshift([player.name, player.id, player.team, false, true]);
            incrementStat(player, 9);

            updateBallColor();
            return;
        }

        const isBlockZone =
            (ballPos.x > -100 && ballPos.y < 68 && player.team === Team.RED) ||
            (ballPos.x <  100 && ballPos.y < 68 && player.team === Team.BLUE);

        if (
            getTeamArray(player.team).length > 1 &&
            state.touches > 1 &&
            state.lastTouches[0] &&
            state.lastTouches[0][2] !== player.team &&
            isBlockZone
        ) {
            room.sendAnnouncement(
                `🛡️Блок: ${player.name}`,
                null, teamColor, 'bold', HaxNotification.CHAT
            );

            state.touches = 0;
            state.lastTouches.unshift([player.name, player.id, player.team, true, false]);

            updateBallColor();
            return;
        }

        if (
            state.lastTouches[0] &&
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
                    null, enemyColor, 'bold', HaxNotification.NONE
                );

                incrementStat(player, 7);
                state.lastTouches = [];
                state.goal_sit = true;
            }
            return;
        }

        if (
            state.lastTouches[0] &&
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
                    null, enemyColor, 'bold', HaxNotification.NONE
                );

                state.lastTouches = [];
                state.goal_sit = true;
            }
            return;
        }

        if (
            !state.goal_sit &&
            state.touches === 2 &&
            state.lastTouches[0] &&
            state.lastTouches[0][2] === player.team &&
            ballPos.y > 68
        ) {
            state.saveBall = true;

            const disc = room.getDiscProperties(0);
            room.setDiscProperties(0, {
                cGroup: disc.cGroup ^ cf.kick,
                xspeed: disc.xspeed + Math.round(disc.xspeed / 2),
                color: 0x03fc45
            });

            room.sendAnnouncement(
                `✳️Сейв-мяч`,
                null, teamColor, 'bold', HaxNotification.CHAT
            );

            state.touches++;
            state.lastTouches.unshift([player.name, player.id, player.team, false, false]);

            updateBallColor();
            return;
        }

        if (!state.goal_sit) {
            if (state.lastTouches[0] && state.lastTouches[0][2] === player.team) {
                state.touches++;
            } else if (
                (state.lastTouches[0] && state.lastTouches[0][2] !== player.team) ||
                (state.touches > 3 && state.training_mode)
            ) {
                state.touches = 1;
            }
        }

        state.lastTouches.unshift([player.name, player.id, player.team, false, false]);
        updateBallColor();
    }

    function onPlayerActivity(player) {
        if (state.mode === Mods.PUBLIC && !state.training_mode) {
            state.inactivityTicks[player.id] = 0;
        }
    }

    return {
        onPlayerChat,
        onPlayerBallKick,
        onPlayerActivity
    };
};