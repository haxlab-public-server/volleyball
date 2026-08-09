module.exports = function createGameEvents({
    room,
    state,
    fs,
    getAuth,
    getTeamArray,
    sendAnnouncementTeam,
    getTimeGame,
    ballSpawner,
    randomizeTeams,
    fetchRecording,
    discordBot,
    getIdReplay,
    Game,
    noGoal_map,
    volleyball_map,
    gamesTimeout,
    Discord,
    Telegram,
    Team,
    Mods,
    Color,
    HaxNotification
}) {
    function loadStats() {
        // TODO: migrate from fs to sqlite in the future
        return JSON.parse(fs.readFileSync('stats.json', 'utf8'));
    }

    function saveStats(stats) {
        // TODO: migrate from fs to sqlite in the future
        fs.writeFileSync('stats.json', JSON.stringify(stats));
    }

    function isFullTeams() {
        return (
            getTeamArray(Team.BLUE).length >= state.teamSize &&
            getTeamArray(Team.RED).length >= state.teamSize
        );
    }

    function teamColor(team) {
        return team === Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE;
    }

    function onTeamGoal(team) {
        if (state.training_mode) return;

        const stats = loadStats();
        state.scores = room.getScores();
        state.goal_sit = true;
        state.saveBall = false;

        const color = teamColor(team);
        const timeStr = getTimeGame(state.scores.time);
        const scoreStr = `${state.scores.red} - ${state.scores.blue}`;

        if (state.lastTouches[0] != null) {
            const goal = state.lastTouches[0];
            const assist =
                state.lastTouches[1] != null &&
                state.lastTouches[1][1] !== goal[1] &&
                state.lastTouches[1][2] === team
                    ? state.lastTouches[1]
                    : null;

            const isGoal = goal[2] === team;

            if (isGoal) {
                let emoji = '🏐';
                let action = assist == null ? '' : `(${assist[0]})`;

                if (goal[3]) {
                    emoji = '🛡️';
                    action = `блокировал удар ${state.lastTouches[1][0]}`;
                } else if (goal[4]) {
                    emoji = '🥏';
                    action = 'сделал ЭЙС с подачи';
                }

                room.sendAnnouncement(
                    `${timeStr} ${emoji} ${goal[0]} ${action} | ${scoreStr}`,
                    null,
                    color,
                    'bold',
                    HaxNotification.CHAT
                );

                if (isFullTeams()) {
                    stats[getAuth(goal[1])][3]++;

                    if (goal[3]) {
                        stats[getAuth(goal[1])][4]++;
                        stats[getAuth(state.lastTouches[1][1])][7]++;
                        stats[getAuth(state.lastTouches[1][1])][6]++;
                    } else if (goal[4]) {
                        stats[getAuth(goal[1])][8]++;
                    }

                    if (assist != null) {
                        stats[getAuth(assist[1])][5]++;
                    }
                }
            } else {
                let text;

                if (goal[3]) {
                    text = `⚔️ ${assist[0]} пробил блок ${goal[0]}`;
                } else if (assist != null && assist[4]) {
                    text = `🥏 ${assist[0]} сделал ЭЙС с подачи`;
                } else {
                    text = `🐔 ${goal[0]}${assist == null ? '' : ` (${assist[0]})`}`;
                }

                room.sendAnnouncement(
                    `${timeStr} ${text} | ${scoreStr}`,
                    null,
                    color,
                    'bold',
                    HaxNotification.CHAT
                );

                if (isFullTeams()) {
                    stats[getAuth(goal[1])][7]++;

                    if (assist != null) {
                        stats[getAuth(assist[1])][3]++;
                    }
                    if (assist != null && assist[4]) {
                        stats[getAuth(assist[1])][8]++;
                    }
                }
            }
        } else {
            room.sendAnnouncement(
                `${timeStr} 📛 Фол ${team === Team.RED ? 'синих' : 'красных'} | ${scoreStr}`,
                null,
                color,
                'bold',
                HaxNotification.CHAT
            );
        }

        if (state.scores.scoreLimit == null || state.scores.scoreLimit === 0) {
            const red = state.scores.red;
            const blue = state.scores.blue;
            const mp = state.newMatchPoint;

            if (red === mp - 1 || blue === mp - 1) {
                if (red === blue) {
                    state.newMatchPoint++;
                    room.sendAnnouncement(
                        `🎯Счёт равный, игра продолжится до ${state.newMatchPoint} мячей`,
                        null,
                        Color.WH_BLUE,
                        'bold',
                        HaxNotification.MENTION
                    );
                } else if (
                    (team === Team.RED && red === mp - 1) ||
                    (team === Team.BLUE && blue === mp - 1)
                ) {
                    room.sendAnnouncement(
                        `🔥Матч поинт ${team === Team.RED ? 'красных' : 'синих'}`,
                        null,
                        color,
                        'bold',
                        HaxNotification.MENTION
                    );
                }
            } else if (red === mp || blue === mp) {
                setTimeout(() => room.stopGame(), 2000);
            }
        }

        if (state.mode === Mods.PUBLIC) {
            saveStats(stats);
        }

        state.ball_color = color;
        state.serve = team;
    }

    function onPositionsReset() {
        if (state.training_mode) return;

        state.lastTouches = [];
        state.touches = 0;
        state.goal_sit = false;
        state.saveBall = false;
        state.serveBall = false;

        room.setDiscProperties(0, { color: state.ball_color });

        if (
            getTeamArray(Team.BLUE).length >= state.teamSize &&
            getTeamArray(Team.RED).length >= state.teamSize
        ) {
            sendAnnouncementTeam(
                `Напиши "!serve" или "!sr", чтобы подать силовую подачу`,
                getTeamArray(state.serve),
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
        }
    }

    function onGameStart() {
        if (state.mode === Mods.PUBLIC && !state.training_mode) {
            clearTimeout(state.onGameStopTimeout);
            state.randomize_sit = false;

            for (const p of getTeamArray(Team.SPECTATORS)) {
                const idx = state.queue.findIndex(q => q[0] === p.id);
                if (idx !== -1) state.queue[idx][1]++;
            }
        }

        if (state.training_mode) {
            state.touches = 0;
            state.goal_sit = false;
            state.scores = null;

            if (state.training_mode_spawn.length !== 0) {
                clearInterval(state.training_interval);
                state.training_interval = setInterval(
                    () => ballSpawner(state.training_mode_spawn),
                    state.training_mode_spawn[4]
                );
            }
            return;
        }

        state.scores = room.getScores();
        state.newMatchPoint = state.matchPoint;
        state.lastTouches = [];
        state.ball_color = Color.TEAM_BLUE;
        state.goal_sit = false;
        state.saveBall = false;
        state.serveBall = false;
        state.touches = 0;
        state.game = new Game(state.teamSize);
        state.serve = Team.BLUE;

        room.setDiscProperties(0, { color: state.ball_color });

        if (
            getTeamArray(Team.BLUE).length >= state.game.teamSize &&
            getTeamArray(Team.RED).length >= state.game.teamSize
        ) {
            sendAnnouncementTeam(
                `Напиши "!serve" или "!sr", чтобы подать силовую подачу`,
                getTeamArray(state.serve),
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
        }
    }

    function onGameStop(byPlayer) {
        if (state.training_mode) {
            clearInterval(state.training_interval);
            room.setCustomStadium(noGoal_map);
            return;
        }

        room.setCustomStadium(volleyball_map);

        if (byPlayer == null && state.scores != null) {
            state.game.rec = room.stopRecording();

            const red = state.scores.red;
            const blue = state.scores.blue;
            let resultText;
            let resultColor;

            if (red > blue) {
                resultText = '🏆Победа красной команды';
                resultColor = Color.TEAM_RED;
            } else if (red === blue) {
                resultText = '💤Ничья';
                resultColor = Color.WH_BLUE;
            } else {
                resultText = '🏆Победа синей команды';
                resultColor = Color.TEAM_BLUE;
            }

            room.sendAnnouncement(
                `${resultText} ${red} - ${blue}`,
                null,
                resultColor,
                'small',
                HaxNotification.NONE
            );

            if (state.winstay_mode && isFullTeams()) {
                if (red === blue) {
                    state.winstay = { streak: 0, team: [] };
                } else {
                    const winnerTeam = red > blue ? Team.RED : Team.BLUE;
                    const winnerArr = getTeamArray(winnerTeam)

                    const sameTeam =
                        state.winstay.team.length > 0 &&
                        winnerArr.length === state.winstay.team.length &&
                        winnerArr.every(a => state.winstay.team.some(p => p.id === a.id));

                    state.winstay = {
                        streak: sameTeam ? state.winstay.streak + 1 : 1,
                        team: winnerArr
                    };
                    
                    if (getTeamArray(Team.SPECTATORS).length > 0) {
                        room.sendAnnouncement(
                            `🔥Серия побед: ${state.winstay.streak}`,
                            null,
                            resultColor,
                            'small',
                            HaxNotification.NONE
                        );
                    }
                }
            }

            if (
                state.mode === Mods.PUBLIC &&
                red !== blue &&
                isFullTeams()
            ) {
                const stats = loadStats();
                const allPlayers = getTeamArray(Team.RED).concat(getTeamArray(Team.BLUE));
                const winners = getTeamArray(red > blue ? Team.RED : Team.BLUE);

                for (const p of allPlayers) {
                    stats[getAuth(p.id)][1]++;
                }
                for (const p of winners) {
                    stats[getAuth(p.id)][2]++;
                }

                saveStats(stats);
            }
        }

        if (state.scores != null) {
            setTimeout((gameEnd) => {
                fetchRecording(gameEnd, discordBot);
                const replayName = getIdReplay();

                room.sendAnnouncement(
                    `💾replay: № ${replayName} | download: ${Discord}`,
                    null,
                    Color.WH_BLUE,
                    'small',
                    HaxNotification.NONE
                );
            }, 500, state.game);
        }

        if (state.mode === Mods.PUBLIC) {
            for (const p of room.getPlayerList()) {
                if (p.team !== Team.SPECTATORS) {
                    room.setPlayerTeam(p.id, Team.SPECTATORS);
                }
            }

            const activePlayers = room.getPlayerList().filter(
                p => state.afkList.findIndex(a => a[0] === p.id) === -1
            );

            if (activePlayers.length > 1) {
                room.sendAnnouncement(
                    `⌚️ Игра начнётся через ${gamesTimeout} секунд.`,
                    null,
                    Color.GR_GREEN,
                    'small',
                    HaxNotification.NONE
                );

                state.randomize_sit = true;
                state.onGameStopTimeout = setTimeout(() => {
                    state.randomize_sit = false;
                    randomizeTeams();
                }, gamesTimeout * 1000);
            } else {
                room.sendAnnouncement(
                    `⛔️ Недостаточно игроков, чтобы начать матч.`,
                    null,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
            }
        }
    }

    return {
        onTeamGoal,
        onPositionsReset,
        onGameStart,
        onGameStop
    };
};