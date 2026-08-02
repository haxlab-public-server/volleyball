module.exports = function createUpdatesUtils({
    room,
    state,
    getTeamArray,
    getRole,
    getRandomInt,
    Mods,
    Team,
    Color,
    HaxNotification,
    defaultTeamSize,
    upTeamSizePlayers,
    queueMatches,
    vipQueueRoles,
    maxPlayers,
    vipSlots
}) {

function updateTeamSize() {
    if (!state.training_mode && state.mode == Mods.PUBLIC) {
        if (room.getPlayerList().filter((p) => state.afkList.findIndex((i) => i[0] == p.id) == -1).length >= upTeamSizePlayers) {
            state.teamSize = defaultTeamSize + 1
        } else {
            state.teamSize = defaultTeamSize
        }
    }
}

function updateTeams() {
    if (state.mode == Mods.PUBLIC && !state.training_mode) {
        if (getTeamArray(Team.RED).length != getTeamArray(Team.BLUE).length && getTeamArray(Team.SPECTATORS).length > 0 && room.getScores() != null) {
            room.setPlayerTeam(getTeamArray(Team.SPECTATORS)[0].id, getTeamArray(Team.RED).length < getTeamArray(Team.BLUE).length ? Team.RED : Team.BLUE)
        } else if (getTeamArray(Team.RED).length == getTeamArray(Team.BLUE).length && getTeamArray(Team.BLUE).length < state.game.teamSize && getTeamArray(Team.SPECTATORS).length >= 2 && room.getScores() != null) {
            room.setPlayerTeam(getTeamArray(Team.SPECTATORS)[0].id, Team.RED)
            room.setPlayerTeam(getTeamArray(Team.SPECTATORS)[0].id, Team.BLUE)
        }
        if (room.getPlayerList().filter((p) => state.afkList.findIndex((i) => i[0] == p.id) == -1).length <= 1) {
            room.stopGame()
        }
        if (getTeamArray(Team.RED).length == 0 || getTeamArray(Team.BLUE).length == 0) {
            room.stopGame()
        }
        if (room.getPlayerList().filter((p) => state.afkList.findIndex((i) => i[0] == p.id) == -1).length >= 2 && room.getScores() == null) {
            randomizeTeams()
        }
    }
    
}

function randomizeTeams() {
    if (state.randomize_sit == false) {
        state.randomize_sit = true
        room.sendAnnouncement(
            `⚖️ Рандомизация команд...`,
            null,
            Color.GR_GREEN,
            "small",
            HaxNotification.NONE
        )
        setTimeout(() => {
            var p_team = Team.RED
            queue_Arr = []
            for (var b of state.queue) {
                if (b[1] >= queueMatches) {
                    queue_Arr.push(b)
                }
            }
            queue_Arr.sort(function (a, b) {
                return b[1] - a[1];
            });
            var plrArr = getTeamArray(Team.SPECTATORS)
            var vips = plrArr.filter(g => vipQueueRoles.includes(getRole(g)) == true)
            if (vips.length > 0) {
                var vipsQueue = []
                for (g of vips) {
                    let index = state.queue.findIndex(l => l[0] == g.id)
                    vipsQueue.push(state.queue[index])
                }
                vipsQueue.sort(function (a, b) {
                    return b[1] - a[1];
                });
                if (state.teamSize <= 2) {
                    var numik = 1
                } else {
                    var numik = 2
                }
                for (var m = 0; m < numik; m++) {
                    var index_in_q = queue_Arr.findIndex(k => k[0] == vipsQueue[m][0])
                    if (index_in_q != -1) {
                        queue_Arr.splice(index_in_q, 1)
                        queue_Arr.unshift(vipsQueue[m])
                    } else {
                        queue_Arr.unshift(vipsQueue[m])
                    }
                }
            }
            if (plrArr.length < state.teamSize*2) {
                if ((state.teamSize*2 - plrArr.length) % 2 == 1) {
                    var fault = (state.teamSize*2 - plrArr.length + queue_Arr.length) + 1
                } else {
                    var fault = state.teamSize*2 - plrArr.length + queue_Arr.length
                }
            } else if (queue_Arr.length > 0 && queue_Arr.length < state.teamSize * 2) {
                var fault = queue_Arr.length
            } else if (queue_Arr.length  >= state.teamSize * 2) {
                var fault = state.teamSize * 2
            } else {
                var fault = 0
            }
            var nums = []
            if (queue_Arr.length <= state.teamSize * 2) {
                for (var g of queue_Arr) {
                    nums.push(g[0])
                }
            } else {
                for (var g = 0; g < (state.teamSize * 2); g++) {
                    nums.push(queue_Arr[g][0])
                }
            }
            arr = getTeamArray(Team.SPECTATORS).filter((n) => nums.findIndex((j) => j == n.id) == -1)
            if (fault != state.teamSize * 2) {
                for (var v = 0; v < (state.teamSize * 2) - fault; v++) {
                    var number = getRandomInt(0, arr.length)
                    nums.push(arr[number].id)
                    arr.splice(number, 1)
                }
            }
            var len = nums.length
            for (var i = 0; i < len; i++) {
                var num = getRandomInt(0, nums.length)
                room.setPlayerTeam(nums[num], p_team)
                nums.splice(num, 1)
                if (p_team == Team.RED) {
                    p_team = Team.BLUE
                } else {
                    p_team = Team.RED
                }
            }
            room.startGame()
        }, 3000)
    }
}

function updateVipSlots() {
    var players = room.getPlayerList()
    if (players.length >= maxPlayers - vipSlots) {
        room.setPassword(`${state.vipPassword}`)
    } else {
        room.setPassword(state.roomPassword)
    }
}

return {
    updateTeamSize,
    updateTeams,
    randomizeTeams,
    updateVipSlots
}

};