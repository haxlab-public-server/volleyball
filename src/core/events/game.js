module.exports = function createGameEvents({
    room,
    state,
    db,
    getAuth,
    getTeamArray,
    sendAnnouncementTeam,
    getTimeGame,
    ballSpawner,
    startPickingTeams,
    fetchRecording,
    discordBot,
    getIdReplay,
    Game,
    noGoal_map,
    volleyball_map,
    gamesTimeout,
    Discord,
    Team,
    Mods,
    Color,
    HaxNotification,
    transitionTo,
    Sits,
    defaultTeamSize,
    analytics,
    t
}) {
    function isFullTeams() {
        return (
            getTeamArray(Team.BLUE).length >= state.game.teamSize &&
            getTeamArray(Team.RED).length >= state.game.teamSize
        );
    }

    function teamColor(team) {
        return team === Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE;
    }

    function onTeamGoal(team) {
        if (state.training_mode) return;

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
                let action = assist == null ? '' : t('game.goal.withAssist', { assist: assist[0] });

                if (goal[3]) {
                    emoji = '🛡️';
                    action = t('game.goal.block', { blocked: state.lastTouches[1][0] });
                } else if (goal[4]) {
                    emoji = '🥏';
                    action = t('game.goal.ace');
                }

                room.sendAnnouncement(
                    t('game.goal.scoreLine', { time: timeStr, emoji, scorer: goal[0], action, score: scoreStr }),
                    null,
                    color,
                    'bold',
                    HaxNotification.CHAT
                );

                if (isFullTeams() && state.mode === Mods.PUBLIC) {
                    (async () => {
                        await db.incrementStat(getAuth(goal[1]), 3);

                        if (goal[3]) {
                            await db.incrementStat(getAuth(goal[1]), 4);
                            await db.incrementStat(getAuth(state.lastTouches[1][1]), 7);
                            await db.incrementStat(getAuth(state.lastTouches[1][1]), 6);
                        } else if (goal[4]) {
                            await db.incrementStat(getAuth(goal[1]), 8);
                        }

                        if (assist != null) {
                            await db.incrementStat(getAuth(assist[1]), 5);
                        }
                    })();
                }
            } else {
                let text;

                if (goal[3]) {
                    text = t('game.goal.counterBlock', { scorer: assist[0], blocked: goal[0] });
                } else if (assist != null && assist[4]) {
                    text = t('game.goal.counterAce', { scorer: assist[0] });
                } else {
                    text = t('game.goal.ownGoal', {
                        scorer: goal[0],
                        assist: assist == null ? '' : t('game.goal.withAssist', { assist: assist[0] })
                    });
                }

                room.sendAnnouncement(
                    t('game.goal.counterScoreLine', { time: timeStr, text, score: scoreStr }),
                    null,
                    color,
                    'bold',
                    HaxNotification.CHAT
                );

                if (isFullTeams() && state.mode === Mods.PUBLIC) {
                    (async () => {
                        await db.incrementStat(getAuth(goal[1]), 7);

                        if (assist != null) {
                            await db.incrementStat(getAuth(assist[1]), 3);
                        }
                        if (assist != null && assist[4]) {
                            await db.incrementStat(getAuth(assist[1]), 8);
                        }
                    })();
                }
            }
        } else {
            room.sendAnnouncement(
                t('game.goal.foul', {
                    time: timeStr,
                    team: team === Team.RED ? t('game.goal.teamRed') : t('game.goal.teamBlue'),
                    score: scoreStr
                }),
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
                        t('game.matchPointTied', { value: state.newMatchPoint }),
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
                        t('game.matchPoint', { team: team === Team.RED ? t('game.teamRed') : t('game.teamBlue') }),
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

        state.ball_color = color;
        state.serve = team;
        state.waitingForServe = true;
    }

    function onPositionsReset() {
        if (state.training_mode) return;

        state.lastTouches = [];
        state.touches = 0;
        state.goal_sit = false;
        state.saveBall = false;
        state.serveBall = false;
        state.waitingForServe = true;
        
        room.setDiscProperties(0, { color: state.ball_color });

        if (
            getTeamArray(Team.BLUE).length >= defaultTeamSize &&
            getTeamArray(Team.RED).length >= defaultTeamSize
        ) {
            sendAnnouncementTeam(
                t('game.serveHint'),
                getTeamArray(state.serve),
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
        }
    }

    function onGameStart() {
        transitionTo(Sits.GAME);
        if (state.mode === Mods.PUBLIC && !state.training_mode) {
            clearTimeout(state.onGameStopTimeout);

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
        state.waitingForServe = true;

        analytics.onGameStart().catch((error) => {
            console.error('Error in analytics.onGameStart:', error);
        });

        room.setDiscProperties(0, { color: state.ball_color });

        if (
            getTeamArray(Team.BLUE).length >= state.game.teamSize &&
            getTeamArray(Team.RED).length >= state.game.teamSize
        ) {
            sendAnnouncementTeam(
                t('game.serveHint'),
                getTeamArray(state.serve),
                Color.WH_BLUE,
                'small',
                HaxNotification.CHAT
            );
        }
    }

    function onGameStop(byPlayer) {
        transitionTo(Sits.NONE);

        analytics.onGameStop({
            byPlayer,
            scores: state.scores
        }).catch((error) => {
            console.error('Error in analytics.onGameStop:', error);
        });

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
                resultText = t('game.result.redWin');
                resultColor = Color.TEAM_RED;
            } else if (red === blue) {
                resultText = t('game.result.draw');
                resultColor = Color.WH_BLUE;
            } else {
                resultText = t('game.result.blueWin');
                resultColor = Color.TEAM_BLUE;
            }

            room.sendAnnouncement(
                `${resultText} ${red} - ${blue}`,
                null,
                resultColor,
                'small',
                HaxNotification.NONE
            );

            if (
                state.mode === Mods.PUBLIC && 
                state.winstay_mode && 
                isFullTeams()
            ) {
                if (red === blue) {
                    state.winstay = { streak: 0, team: [] };
                } else {
                    const winnerTeam = red > blue ? Team.RED : Team.BLUE;
                    const winnerArr = getTeamArray(winnerTeam)
                    const winnerAuths = winnerArr.map(p => getAuth(p.id));

                    const WINSTAY_MATCH_THRESHOLD = 2 / 3;
                    const requiredMatches = Math.ceil(
                        state.winstay.team.length * WINSTAY_MATCH_THRESHOLD
                    );
                    const matchedCount = state.winstay.team.filter(
                        auth => winnerAuths.includes(auth)
                    ).length;

                    const sameTeam =
                        state.winstay.team.length > 0 &&
                        matchedCount >= requiredMatches;

                    state.winstay = {
                        streak: sameTeam ? state.winstay.streak + 1 : 1,
                        team: winnerAuths
                    };
                    
                    if (getTeamArray(Team.SPECTATORS).length > 0) {
                        room.sendAnnouncement(
                            t('winstay.streak', { streak: state.winstay.streak }),
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
                const allPlayers = getTeamArray(Team.RED).concat(getTeamArray(Team.BLUE));
                const winners = getTeamArray(red > blue ? Team.RED : Team.BLUE);

                (async () => {
                    for (const p of allPlayers) {
                        await db.incrementStat(getAuth(p.id), 1);
                    }
                    for (const p of winners) {
                        await db.incrementStat(getAuth(p.id), 2);
                    }
                })();
            }
        }

        if (state.scores != null) {
            setTimeout((gameEnd) => {
                fetchRecording(gameEnd, discordBot);
                const replayName = getIdReplay();

                room.sendAnnouncement(
                    t('game.replay', { id: replayName, discord: Discord }),
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
                    t('game.timeout', { seconds: gamesTimeout }),
                    null,
                    Color.GR_GREEN,
                    'small',
                    HaxNotification.NONE
                );
                  transitionTo(Sits.TIMEOUT);
                state.onGameStopTimeout = setTimeout(async () => {
                      transitionTo(Sits.NONE);
                    await startPickingTeams();
                }, gamesTimeout * 1000);
            } else {
                room.sendAnnouncement(
                    t('game.notEnoughPlayers'),
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