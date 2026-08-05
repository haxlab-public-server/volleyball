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
    replayWebhook,
    getIdReplay,
    Game,
    defaultTeamSize,
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

function onTeamGoal(team) {
    if (!state.training_mode) {
        // TODO: migrate from fs to sqlite in the future
        var stats = JSON.parse(fs.readFileSync('stats.json', 'utf8')); 
        state.scores = room.getScores()
        state.goal_sit = true
        state.saveBall = false
        if (state.lastTouches[0] != undefined) {
            goal = state.lastTouches[0] 
            assist = goal != undefined && state.lastTouches[1] != undefined && state.lastTouches[1][1] != state.lastTouches[0][1] && state.lastTouches[1][2] == team ? state.lastTouches[1] : null
            if (goal[2] == team) {
                room.sendAnnouncement(
                    `${getTimeGame(state.scores.time)} ${goal[3] == true ? "🛡️" : goal[4] == true ? "🥏" : "🏐"} ${goal[0]} ${goal[3] == true ? `блокировал удар ${state.lastTouches[1][0]}` : goal[4] == true ? "сделал ЭЙС с подачи" : `${assist == null ? "" : `(${assist[0]})`}`} | ${state.scores.red} - ${state.scores.blue}`,
                    null,
                    team == Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE,
                    "bold",
                    HaxNotification.CHAT
                )
                if (getTeamArray(Team.BLUE).length >= defaultTeamSize && getTeamArray(Team.RED).length >= defaultTeamSize) {
                    stats[getAuth(goal[1])][3]++
                    if (goal[3] == true) {
                        stats[getAuth(goal[1])][4]++
                        stats[getAuth(state.lastTouches[1][1])][7]++
                        stats[getAuth(state.lastTouches[1][1])][6]++
                    } else if (goal[4] == true) {
                        stats[getAuth(goal[1])][8]++
                    }
                    if (assist != null) {
                        stats[getAuth(assist[1])][5]++
                    }
                }
            } else {
                room.sendAnnouncement(
                    `${getTimeGame(state.scores.time)} ${goal[3] == true ? `⚔️ ${assist[0]} пробил блок ${goal[0]}` : assist != null ? assist[4] == true ? `🥏 ${assist[0]} сделал ЭЙС с подачи` : `🐔 ${goal[0]} ${assist == null ? `` : `(${assist[0]})`}` : `🐔 ${goal[0]} ${assist == null ? `` : `(${assist[0]})`}`} | ${state.scores.red} - ${state.scores.blue}`,
                    null,
                    team == Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE,
                    "bold",
                    HaxNotification.CHAT
                )
                if (getTeamArray(Team.BLUE).length >= defaultTeamSize && getTeamArray(Team.RED).length >= defaultTeamSize) {
                    stats[getAuth(goal[1])][7]++
                    if (assist != null) {
                        stats[getAuth(assist[1])][3]++
                    }
                    if (assist != null && assist[4] == true) {
                        stats[getAuth(goal[1])][8]++
                    }
                }
            }
        } else {
            room.sendAnnouncement(
                `${getTimeGame(state.scores.time)} 📛 Фол ${team == Team.RED ? "синих" : "красных"} | ${state.scores.red} - ${state.scores.blue}`,
                null,
                team == Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE,
                "bold",
                HaxNotification.CHAT
            )
        }
        if (state.scores.scoreLimit == undefined || state.scores.scoreLimit == 0) {
            if (state.scores.red == state.newMatchPoint - 1 || state.scores.blue == state.newMatchPoint - 1) {
                if (state.scores.red == state.scores.blue) {
                    state.newMatchPoint++
                    room.sendAnnouncement(
                        `🎯Счёт равный, игра продолжится до ${state.newMatchPoint} мячей`,
                        null,
                        Color.WH_BLUE,
                        "bold",
                        HaxNotification.MENTION
                    )
                } else if ((team == Team.RED && state.scores.red == state.newMatchPoint - 1) || (team == Team.BLUE && state.scores.blue == state.newMatchPoint - 1)) {
                    room.sendAnnouncement(
                        `🔥Матч поинт ${team == Team.RED ? "красных" : "синих"}`,
                        null,
                        team == Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE,
                        "bold",
                        HaxNotification.MENTION
                    )
                }
            } else if (state.scores.red == state.newMatchPoint || state.scores.blue == state.newMatchPoint) {
                setTimeout(() => {
                    room.stopGame()
                },2000)
            }
        }
        if (state.mode == Mods.PUBLIC) {
            // TODO: migrate from fs to sqlite in the future
            fs.writeFileSync("stats.json", JSON.stringify(stats))
        }
        state.ball_color = team == Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE
        state.serve = team
    }
}

function onPositionsReset() {
    if (!state.training_mode) {
        state.lastTouches = []
        state.touches = 0
        room.setDiscProperties(0, {color: state.ball_color})
        state.goal_sit = false
        state.saveBall = false
        state.serveBall = false
        if (getTeamArray(Team.BLUE).length >= state.teamSize && getTeamArray(Team.RED).length >= state.teamSize) {
            sendAnnouncementTeam(
                `Напиши "!serve" или "!sr", чтобы подать силовую подачу`,
                getTeamArray(state.serve),
                Color.WH_BLUE,
                "small",
                HaxNotification.CHAT
            )
        }
    }
    
}

function onGameStart(byPlayer) {
    if (state.mode == Mods.PUBLIC && !state.training_mode) {
        clearTimeout(state.onGameStopTimeout)
        state.randomize_sit = false
        for (var i of getTeamArray(Team.SPECTATORS)) {
            state.queue[state.queue.findIndex((p) => p[0] == i.id)][1]++
        }
    }
    if (state.training_mode) {
        state.touches = 0
        state.goal_sit = false
        state.scores = null
        if (state.training_mode_spawn.length != 0) {
            clearInterval(state.training_interval)
            state.training_interval = setInterval(() => { 
                ballSpawner(state.training_mode_spawn)
            }, state.training_mode_spawn[4])
        }
    } else {
        state.scores = room.getScores()
        state.newMatchPoint = state.matchPoint
        state.lastTouches = []
        state.ball_color = Color.TEAM_BLUE
        room.setDiscProperties(0, {color: state.ball_color})
        state.goal_sit = false
        state.saveBall = false
        state.serveBall = false
        state.touches = 0
        state.game = new Game(state.teamSize)
        state.serve = Team.BLUE
        if (getTeamArray(Team.BLUE).length >= state.game.teamSize && getTeamArray(Team.RED).length >= state.game.teamSize) {
            sendAnnouncementTeam(
                `Напиши "!serve" или "!sr", чтобы подать силовую подачу`,
                getTeamArray(state.serve),
                Color.WH_BLUE,
                "small",
                HaxNotification.CHAT
            )
        }
    }
}

function onGameStop(byPlayer) {
    if (state.training_mode) {
        clearInterval(state.training_interval)
        room.setCustomStadium(noGoal_map);
    } else {
        room.setCustomStadium(volleyball_map);
        if (byPlayer == null && state.scores != undefined) {
            state.game.rec = room.stopRecording();
            room.sendAnnouncement(
                `${state.scores.red > state.scores.blue ? "🏆Победа красной команды" : state.scores.red == state.scores.blue ? "💤Ничья" : "🏆Победа синей команды"} ${state.scores.red} - ${state.scores.blue}`,
                null,
                state.scores.red > state.scores.blue ? Color.TEAM_RED : state.scores.red == state.scores.blue ? Color.WH_BLUE : Color.TEAM_BLUE,
                "small",
                HaxNotification.NONE
            )
            if (state.mode == Mods.PUBLIC) {
                if (state.scores.red > state.scores.blue || state.scores.blue > state.scores.red) {
                    if (getTeamArray(Team.BLUE).length >= defaultTeamSize && getTeamArray(Team.RED).length >= defaultTeamSize) {
                        // TODO: migrate from fs to sqlite in the future
                        var stats = JSON.parse(fs.readFileSync('stats.json', 'utf8')); 
                        for (var k of getTeamArray(Team.RED).concat(getTeamArray(Team.BLUE))) {
                            stats[getAuth(k.id)][1]++
                        }
                        for (var h of getTeamArray(state.scores.red > state.scores.blue ? Team.RED : Team.BLUE)) {
                            stats[getAuth(h.id)][2]++
                        }
                        // TODO: migrate from fs to sqlite in the future
                        fs.writeFileSync("stats.json", JSON.stringify(stats))
                    }
                }
            }
        }
        room.sendAnnouncement(
            `Заходи на наш discord-сервер: ${Discord} .\nПодписывайся на мой telegram: ${Telegram}`,
            null,
            Color.WH_BLUE,
            "bold",
            HaxNotification.CHAT
        )
        if (state.mode == Mods.PUBLIC) {
            for (var i of room.getPlayerList()) {
                if (i.team != Team.SPECTATORS) {
                    room.setPlayerTeam(i.id, Team.SPECTATORS)
                }
            }
            if (room.getPlayerList().filter((p) => state.afkList.findIndex((i) => i[0] == p.id) == -1).length > 1) {
                room.sendAnnouncement(
                    `⌚️ Игра начнётся через ${gamesTimeout} секунд.`,
                    null,
                    Color.GR_GREEN,
                    "small",
                    HaxNotification.NONE
                )
                state.randomize_sit = true
                state.onGameStopTimeout = setTimeout(() => {
                    state.randomize_sit = false
                    randomizeTeams()
                }, gamesTimeout * 1000)
            } else {
                room.sendAnnouncement(
                    `⛔️ Недостаточно игроков, чтобы начать матч.`,
                    null,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                )
            }
        }
        if (state.scores != undefined && state.scores != null) {
            setTimeout(
                (gameEnd) => {
                    fetchRecording(replayWebhook, gameEnd);
                    replay_name = getIdReplay()
                    room.sendAnnouncement(
                        `💾replay: № ${replay_name} | download: ${Discord}`,
                        null,
                        Color.WH_BLUE,
                        "small",
                        HaxNotification.NONE
                    )
                },
                500,
                state.game
            );
        }
    }
}

return {
    onTeamGoal,
    onPositionsReset,
    onGameStart,
    onGameStop
}

};