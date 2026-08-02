module.exports = function createIntervals({
    room,
    state,
    cf,
    fs,
    muteArray,
    lastIds,
    getRandomInt,
    getTeamArray,
    checkRoles,
    updateTeams,
    vipWebhook,
    maxInactivity,
    Team,
    Mods,
    Color,
    HaxNotification,
    updateVipSlots
}) {

setInterval(() => {
    state.vipPassword = getRandomInt(100000, 999999)
    if (vipWebhook != null && vipWebhook != "") {
        fetch(vipWebhook, {
            method: "POST",
            body: JSON.stringify({
                content: `# 🌟Новый VIP-Пароль: ${state.vipPassword}`,
                username: "vip",
            }),
            headers: {
                "Content-Type": "application/json",
            },
        }).then((res) => res);
    }
    let d = new Date()
    console.log(`[${d.getDate()}.${d.getMonth()}.${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}] 🌟Новый VIP-Пароль: ${state.vipPassword}`)
    updateVipSlots()
}, 60*60*1000)

setInterval(() => { 
    // TODO: migrate from fs to sqlite in the future
    var banList = JSON.parse(fs.readFileSync('bans.json', 'utf8'));
    for (var i = 0; i < banList.length; i++) {
        if (banList[i]["date"] < Date.now()) {
            if (banList[i]["id"] != null) {
                room.clearBan(banList[i]["id"])
            }
            banList = banList.filter((p) => p["auth"] != banList[i]["auth"]);
        }
    }
    // TODO: migrate from fs to sqlite in the future
    fs.writeFileSync("bans.json", JSON.stringify(banList))
    muteArray.checkMutes()
    muteArray.updateMutes()
    checkRoles()
    if (room.getPlayerList().length > 0) {
        // TODO: migrate from fs to sqlite in the future
        var stats = JSON.parse(fs.readFileSync('stats.json', 'utf8'));
        var lastIdsVals = Object.values(lastIds)
        for (var j of room.getPlayerList()) {
            stats[lastIdsVals[lastIdsVals.findIndex(k => k[0] == j.id)][2]][10] += 1
        }
        // TODO: migrate from fs to sqlite in the future
        fs.writeFileSync("stats.json", JSON.stringify(stats))
    }
}, 60 * 1000)

setInterval(() => {
    if (state.mode == Mods.PUBLIC) {
        for (var i of getTeamArray(Team.RED).concat(getTeamArray(Team.BLUE))) {
            state.inactivityTicks[i.id]++
            if (state.inactivityTicks[i.id] >= maxInactivity) {
                room.kickPlayer(i.id, `АФК на площадке`, false);
            } else if (state.inactivityTicks[i.id] == (maxInactivity - Math.round(maxInactivity / 3))) {
                room.sendAnnouncement(
                    `⛔️Если ты не проявишь признаки жизни в течении ${Math.round(maxInactivity / 3)}сек, ты будешь кикнут`,
                    i.id,
                    Color.GR_RED,
                    "bold",
                    HaxNotification.MENTION
                )
            }
        }
    }
}, 1000)

// onGameTick replacement
setInterval(() => {
    if (room.getScores() != null) {
        ballPos = room.getBallPosition()
        if (state.goal_sit == false && state.serveBall) {
            if ((((ballPos.y >= 68 && ballPos.x >= 0.1) || ballPos.x >= 100) && state.serve == Team.RED ) || (((ballPos.y >= 68 && ballPos.x <= -0.1) || ballPos.x <= -100) && state.serve == Team.BLUE)) {
                state.serveBall = false
                state.ball_color = 0xffffff
                disc = room.getDiscProperties(0)
                room.setDiscProperties(0, {
                    cGroup: disc.cGroup | cf.kick,
                    color: state.ball_color
                })
            }
            return;
        }
        if (state.goal_sit == false && state.saveBall) {
            if ((((ballPos.y >= 68 && ballPos.x >= 0.1) || ballPos.x >= 100) && state.lastTouches[0][2] == Team.RED) || (((ballPos.y >= 68 && ballPos.x <= -0.1) || ballPos.x <= -100) && state.lastTouches[0][2] == Team.BLUE)) {
                state.saveBall = false
                state.ball_color = 0xffffff
                disc = room.getDiscProperties(0)
                room.setDiscProperties(0, {
                    cGroup: disc.cGroup | cf.kick,
                    color: state.ball_color
                })
            }
            return;
        }
        if (state.goal_sit == false && ballPos.x > 0.1 && (state.lastTouches[0] != undefined && state.lastTouches[0][2] == Team.RED)) {
            state.ball_color = 0xffffff
            room.setDiscProperties(0, {color: state.ball_color})
        } else if (state.goal_sit == false && ballPos.x < -0.1 && (state.lastTouches[0] != undefined && state.lastTouches[0][2] == Team.BLUE)) {
            state.ball_color = 0xffffff
            room.setDiscProperties(0, {color: state.ball_color})
        }
        updateTeams()
    }    
}, 50)

};