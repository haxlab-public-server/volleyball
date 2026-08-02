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
    getActTime,
    getChatColor,
    teamChatCommand,
    defaultTeamSize,
    Role,
    Team,
    Mods,
    Color,
    HaxNotification
}) {

function onPlayerChat(player, message) {
    let msgArray = message.split(/ +/);
    state.inactivityTicks[player.id] = 0
    if (msgArray[0][0] == "!") {
        let command = getCommand(msgArray[0].slice(1).toLowerCase());
        if (command != false && commands[command].roles <= getRole(player))
            commands[command].function(player, message);
        else
            room.sendAnnouncement(
                `Команда, которую вы пытались ввести, для вас не существует. Пожалуйста, введите '!help', чтобы получить доступные команды.`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        return false;
    }
    if (
        !player.admin &&
        muteArray.getByAuth(getAuth(player.id)) != null
    ) {
        mute = muteArray.getByAuth(getAuth(player.id))
        room.sendAnnouncement(
            `Вы в муте: ${Math.round((mute.unmuteDate - Date.now())/1000/60)}мин (ваши сообщения видят админы)`,
            player.id,
            Color.GR_RED,
            "bold",
            HaxNotification.MENTION
        );
        sendAnnouncementTeam(
            `*MUTED* [${getActTime()}] ${player.name} (${player.id}): ${message}`,
            room.getPlayerList().filter(plr => getRole(plr) >= Role.PREADMIN),
            Color.GREY,
            null,
            HaxNotification.NONE
        )
        return false;
    }
    if (msgArray[0].toLowerCase() == "ч" || msgArray[0].toLowerCase() == "x" || msgArray[0].toLowerCase() == "t") {
        teamChatCommand(player, message);
        return false;
    }
    var chat_color = getChatColor(player)
    if (chat_color != null) {
        var type = "bold"
    } else {
        var type = null
    }
    sendAnnouncementTeam(
        `[${getActTime()}] ${player.name} (${player.id}): ${message}`,
        room.getPlayerList().filter(plr => getRole(plr) >= Role.PREADMIN),
        chat_color,
        type,
        HaxNotification.CHAT
    )
    sendAnnouncementTeam(
        `[${getActTime()}] ${player.name}: ${message}`,
        room.getPlayerList().filter(plr => getRole(plr) < Role.PREADMIN),
        chat_color,
        type,
        HaxNotification.CHAT
    )
    return false
}

function onPlayerBallKick(player) {
    var ballPos = room.getBallPosition()
    if (state.goal_sit == false && state.serveBall == true) {
        room.sendAnnouncement(
            `🥏Силовая подача: ${player.name}`,
            null,
            player.team == Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE,
            "bold",
            HaxNotification.CHAT
        )
        state.ball_color = 0x42f5d4
        disc = room.getDiscProperties(0)
        room.setDiscProperties(0, {
            cGroup: disc.cGroup ^ cf.kick,
            xspeed: disc.xspeed > 0 ? disc.xspeed + Math.round(disc.xspeed / 1.5) : disc.xspeed + Math.round(disc.xspeed / 1.5),
            color: state.ball_color
        })
        state.lastTouches.unshift([player.name, player.id, player.team, false, true])
        if (getTeamArray(Team.BLUE).length >= defaultTeamSize && getTeamArray(Team.RED).length >= defaultTeamSize && state.mode == Mods.PUBLIC) {
            // TODO: migrate from fs to sqlite in the future
            var stats = JSON.parse(fs.readFileSync('stats.json', 'utf8'));
            stats[getAuth(player.id)][9]++
            // TODO: migrate from fs to sqlite in the future
            fs.writeFileSync("stats.json", JSON.stringify(stats))
        }
        return;
    }
    if (getTeamArray(player.team).length > 1 && state.touches > 1 && state.lastTouches[0] != undefined && state.lastTouches[0][2] != player.team && ((ballPos.x > -100 && ballPos.y < 68 && player.team == Team.RED) || (ballPos.x < 100 && ballPos.y < 68 && player.team == Team.BLUE))) {
        room.sendAnnouncement(
            `🛡️Блок: ${player.name}`,
            null,
            player.team == Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE,
            "bold",
            HaxNotification.CHAT
        )
        state.touches = 0
        state.ball_color = 0xffffff
        state.lastTouches.unshift([player.name, player.id, player.team, true, false])
        return;
    }
    if (state.lastTouches[0] != undefined && (state.lastTouches[0][1] == player.id && getTeamArray(player.team).length > 1) && state.touches >= 1) {
        if (state.goal_sit == false && !state.training_mode) {
            room.setDiscProperties(0, {
                xspeed: player.team == Team.RED ? -100 : 100,
                yspeed: 70,
            })
            room.sendAnnouncement(
                `📛Двойное касание: ${player.name}`,
                null,
                player.team == Team.RED ? Color.TEAM_BLUE : Color.TEAM_RED,
                "bold",
                HaxNotification.NONE
            )
            if (getTeamArray(Team.BLUE).length >= defaultTeamSize && getTeamArray(Team.RED).length >= defaultTeamSize && state.mode == Mods.PUBLIC) {
                // TODO: migrate from fs to sqlite in the future
                var stats = JSON.parse(fs.readFileSync('stats.json', 'utf8')); 
                stats[getAuth(player.id)][7]++
                // TODO: migrate from fs to sqlite in the future
                fs.writeFileSync("stats.json", JSON.stringify(stats))
            }
            state.lastTouches = []
            state.goal_sit = true
            return;
        }
        return;
    } else if (state.lastTouches[0] != undefined && state.touches == 3 && state.lastTouches[0][2] == player.team) {
        if (state.goal_sit == false && !state.training_mode) {
            room.setDiscProperties(0, {
                xspeed: player.team == Team.RED ? -100 : 100,
                yspeed: 70,
            })
            room.sendAnnouncement(
                `📛4 касания: ${player.team == Team.RED ? "красные" : "синие"}`,
                null,
                player.team == Team.RED ? Color.TEAM_BLUE : Color.TEAM_RED,
                "bold",
                HaxNotification.NONE
            )
            state.lastTouches = []
            state.goal_sit = true
            return;
        }
    }
    if (state.goal_sit == false && state.touches == 2 && state.lastTouches[0] != undefined && state.lastTouches[0][2] == player.team && ballPos.y > 68) {
        state.saveBall = true
        state.ball_color = 0x03fc45
        disc = room.getDiscProperties(0)
        room.setDiscProperties(0, {
            cGroup: disc.cGroup ^ cf.kick,
            xspeed: disc.xspeed > 0 ? disc.xspeed + Math.round(disc.xspeed / 2) : disc.xspeed + Math.round(disc.xspeed / 2),
            color: state.ball_color
        })
        room.sendAnnouncement(
            `✳️Сейв-мяч`,
            null,
            player.team == Team.RED ?  Color.TEAM_RED : Color.TEAM_BLUE,
            "bold",
            HaxNotification.CHAT
        )
        state.touches++
        state.lastTouches.unshift([player.name, player.id, player.team, false, false])
        return;
    }
    if (state.lastTouches[0] != undefined && state.lastTouches[0][2] == player.team && state.goal_sit == false) {
        state.touches++
        switch (state.touches) {
            case 1: state.ball_color = 0xe0ca48; break;
            case 2: state.ball_color = 0xcc2929; break;
            default: state.ball_color = 0xffffff; break;
        }
    } else if (state.lastTouches[0] != undefined && state.lastTouches[0][2] != player.team && state.goal_sit == false || (state.touches > 3 && state.training_mode)) {
        state.touches = 1
        state.ball_color = 0xe0ca48
    }
    room.setDiscProperties(0, {color: state.ball_color})
    state.lastTouches.unshift([player.name, player.id, player.team, false, false])
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