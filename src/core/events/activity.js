module.exports = function createActivityEvents({
    room,
    state,
    cf,
    db,
    muteArray,
    getAuth,
    getRole,
    getCommand,
    commands,
    getTeamArray,
    sendAnnouncementTeam,
    getChatColor,
    teamChatCommand,
    trySilentServe,
    defaultTeamSize,
    Role,
    Team,
    Mods,
    Color,
    Serve,
    ServeString,
    HaxNotification,
    discordBot,
    updateBallColor,
    Sits,
    isCurrentPickingCaptain,
    capPick,
    continueCaptainPick,
    t
}) {

    async function getDisplayName(player) {
        const role = await getRole(player);
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

    async function incrementStat(player, index) {
        if (!isFullPublicTeams()) return;
        await db.incrementStat(getAuth(player.id), index);
    }

    function isPickMessage(message) {
        if (!/^\d+$/.test(message)) return false;
        const pickedNumber = parseInt(message, 10);
        const specsCount = getTeamArray(Team.SPECTATORS).length;
        return pickedNumber >= 1 && pickedNumber <= specsCount;
    }

    function trySilentServeShortcut(player, message) {
        const serveType = ServeString[message.toLowerCase()];
        if (!serveType) return false;

        const result = trySilentServe(player, serveType);
        return result.ok;
    }

    function onPlayerChat(player, message) {
        discordBot.sendLog(`[${getAuth(player.id)}] **${player.name}**: ${message}`);
        state.inactivityTicks[player.id] = 0;

        const processChatAsync = async () => {
            const msgArray = message.split(/ +/);
            const firstWord = msgArray[0]?.toLowerCase() || '';

            if (state.sit === Sits.CHOICE && isCurrentPickingCaptain(player) && isPickMessage(message)) {
                const picked = capPick(player, player.team, parseInt(message, 10));
                if (picked) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    await continueCaptainPick();
                }
                return;
            }

            if (ServeString[message.toLowerCase()] && trySilentServeShortcut(player, message)) {
                return;
            }

            if (firstWord.startsWith('!')) {
                const commandName = firstWord.slice(1);
                const command = getCommand(commandName);
                const playerRole = await getRole(player);

                if (command !== false && commands[command].roles <= playerRole) {
                    commands[command].function(player, message);
                } else {
                    room.sendAnnouncement(
                        t('chat.unknownCommand'),
                        player.id,
                        Color.GR_RED,
                        'small',
                        HaxNotification.CHAT
                    );
                }
                return;
            }

            if (!player.admin) {
                const mute = muteArray.getByAuth(getAuth(player.id));
                if (mute) {
                    const minsLeft = Math.round((mute.unmuteDate - Date.now()) / 1000 / 60);

                    room.sendAnnouncement(
                        t('mute.stillMuted', { mins: minsLeft }),
                        player.id,
                        Color.GR_RED,
                        'bold',
                        HaxNotification.MENTION
                    );

                    const allPlayers = room.getPlayerList();
                    const adminPlayers = [];
                    for (const p of allPlayers) {
                        if (await getRole(p) >= Role.PREADMIN) adminPlayers.push(p);
                    }

                    sendAnnouncementTeam(
                        t('mute.mutedChatEcho', { name: player.name, id: player.id, message }),
                        adminPlayers,
                        Color.GREY,
                        null,
                        HaxNotification.NONE
                    );
                    return; 
                }
            }

            if (firstWord === 'ч' || firstWord === 'x' || firstWord === 't') {
                teamChatCommand(player, message);
                return; 
            }

            const displayName = await getDisplayName(player);
            const chatColor = await getChatColor(player);
            const style = chatColor != null ? 'bold' : null;
            const playerRole = await getRole(player);

            const allPlayers = room.getPlayerList();
            const preAdmins = [];
            const normals = [];
            
            for (const p of allPlayers) {
                const r = await getRole(p);
                if (r >= Role.PREADMIN) preAdmins.push(p);
                else normals.push(p);
            }

            const isAllMention = playerRole >= Role.ADMIN && /@all\b/i.test(message);

            if (isAllMention) {
                sendAnnouncementTeam(
                    t('chat.messageWithId', { displayName, id: player.id, message }),
                    preAdmins,
                    chatColor,
                    'bold',
                    HaxNotification.MENTION
                );

                sendAnnouncementTeam(
                    t('chat.message', { displayName, message }),
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
                        ? t('chat.messageWithId', { displayName, id: player.id, message })
                        : t('chat.message', { displayName, message });

                    room.sendAnnouncement(text, id, chatColor, 'bold', HaxNotification.MENTION);
                }

                const nonMentionedAdmins  = preAdmins.filter(p => !mentionedIds.has(p.id));
                const nonMentionedNormals = normals.filter(p => !mentionedIds.has(p.id));

                if (nonMentionedAdmins.length > 0) {
                    sendAnnouncementTeam(
                        t('chat.messageWithId', { displayName, id: player.id, message }),
                        nonMentionedAdmins,
                        chatColor,
                        style,
                        HaxNotification.CHAT
                    );
                }

                if (nonMentionedNormals.length > 0) {
                    sendAnnouncementTeam(
                        t('chat.message', { displayName, message }),
                        nonMentionedNormals,
                        chatColor,
                        style,
                        HaxNotification.CHAT
                    );
                }
            }
        };

        processChatAsync().catch((error) => {
            console.error('Error in room.onPlayerChat:', error);
        });

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
                t('game.serve', { name: player.name }),
                null, teamColor, 'bold', HaxNotification.CHAT
            );

            const disc = room.getDiscProperties(0);
            const boostDivisor = state.serveType == Serve.FLOAT ? 4 : 1.5;
            room.setDiscProperties(0, {
                cGroup: disc.cGroup ^ cf.kick,
                xspeed: disc.xspeed + disc.xspeed / boostDivisor,
                color: 0x42f5d4
            });

            state.touches = 0;
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
                t('game.block', { name: player.name }),
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
                    t('game.doubleTouch', { name: player.name }),
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
                    t('game.fourTouches', { team: player.team === Team.RED ? t('game.teamRed') : t('game.teamBlue') }),
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
                t('game.saveBall'),
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