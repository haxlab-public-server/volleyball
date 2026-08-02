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
    Telegram
}) {

function onPlayerJoin(player) {
    lastIds[player.auth] = [player.id, player.conn, player.auth]
    if (room.getPlayerList().length > 1) {
        let plrys = room.getPlayerList().filter(plr => plr.id != player.id)
        if (GhostKick && plrys.findIndex(g => getConn(g.id) == player.conn) != -1) {
            room.kickPlayer(player.id, `Кажется ты уже есть в комнате`, false)
            return false
        }
    }
    // TODO: migrate from fs to sqlite in the future
    var accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf8'));
    if (accounts[player.auth] == undefined || accounts[player.auth] == null) {
        accounts[player.auth] = {"nickname": player.name,"role": "player", "date": null, "discord": null, "chat_color": null}
    } else {
        accounts[player.auth]["nickname"] = player.name
    }
    // TODO: migrate from fs to sqlite in the future
    fs.writeFileSync("accounts.json", JSON.stringify(accounts))
    // TODO: migrate from fs to sqlite in the future
    var banList = JSON.parse(fs.readFileSync('bans.json', 'utf8'));
    if (banList.findIndex((p) => p['auth'] == player.auth) != -1 || banList.findIndex((h) => h['conn'] == player.conn) != -1) {
        let index = banList.findIndex((p) => p['auth'] == player.auth)
        banList[index]['id'] = player.id
        banList[index]['name'] = player.name
        banList[index]['conn'] = player.conn
        banList[index]['auth'] = player.auth
        // TODO: migrate from fs to sqlite in the future
        fs.writeFileSync("bans.json", JSON.stringify(banList))
        setTimeout(() => {
            room.kickPlayer(player.id, `Вы забанены: ${Math.round((banList[index]["date"] - Date.now())/1000/60)} мин\n discord: ${Discord}\n telegram: ${Telegram}`, true)
        }, 700)
        return;
    }
    if (state.joinAuths && getRole(player) < Role.ADMIN) {
        // TODO: migrate from fs to sqlite in the future
        var auths = JSON.parse(fs.readFileSync('auths.json', 'utf8'));
        if (auths.findIndex((o) => o == player.auth) == -1) {
            setTimeout(() => {
                room.kickPlayer(player.id, `Сейчас в комнату могут зайти только авторизованные игроки\n discord: ${Discord}\n telegram: ${Telegram}`, false)
            }, 700)
        }
    }
    state.inactivityTicks[player.id] = 0
    state.queue.push([player.id, 0])
    // TODO: migrate from fs to sqlite in the future
    var deanon = JSON.parse(fs.readFileSync('nicknames.json', 'utf8'));
    if (player.auth in deanon) {
        if (deanon[player.auth].findIndex((pname) => pname == player.name) == -1) {
            deanon[player.auth].push(player.name)
        }
    } else {
        deanon[player.auth] = [player.name]
    }
    let data = JSON.stringify(deanon)
    // TODO: migrate from fs to sqlite in the future
    fs.writeFileSync("nicknames.json", data)
    // TODO: migrate from fs to sqlite in the future
    var stats = JSON.parse(fs.readFileSync('stats.json', 'utf8'));
    if (stats[player.auth] == undefined) {
        stats[player.auth] = [player.name, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
    // TODO: migrate from fs to sqlite in the future
    fs.writeFileSync("stats.json", JSON.stringify(stats))
    plr_role = getRole(player)
    switch (plr_role) {
        case Role.MASTER: var role = "Создатель"; break
        case Role.VIPADMIN: var role = "VIP-Администратор"; break
        case Role.ADMIN: var role = "Администратор"; break
        case Role.PREADMIN: var role = "Мл. Администратор"; break
        case Role.VIP: var role="VIP";break
    }
    if (plr_role >= Role.ADMIN) {
        room.setPlayerAdmin(player.id, true);
        room.sendAnnouncement(
            `💥 ${role} ${player.name} зашёл на комнату!`,
            null,
            Color.RED,
            "bold",
            HaxNotification.CHAT
        )
    } else if (plr_role == Role.VIP) {
        if (state.mode == Mods.PRIVATE) {
            room.setPlayerAdmin(player.id, true);
        }
        room.sendAnnouncement(
            `🌟 ${role} ${player.name} зашёл на комнату!`,
            null,
            Color.PINK,
            "bold",
            HaxNotification.CHAT
        )
    } else if (plr_role == Role.PREADMIN) {
        room.setPlayerAdmin(player.id, true);
        room.sendAnnouncement(
            `💢 ${role} ${player.name} зашёл на комнату!`,
            null,
            Color.RED,
            "bold",
            HaxNotification.CHAT
        )
    }
    room.sendAnnouncement(
        `Заходи на наш discord-сервер: ${Discord} .\nПодписывайся на мой telegram: ${Telegram}\nНапиши "!help" чтобы узнать список доступных команд.\nНапиши перед сообщением "ч", чтобы писать в чат команды\nПо всем вопросам tg: chesdes`,
        player.id,
        Color.GR_GREEN,
        "small",
        HaxNotification.NONE
    )
    updateVipSlots()
    updateTeams()
    updateTeamSize()
}

function onPlayerLeave(player) {
    state.queue = state.queue.filter((p) => p[0] != player.id)
    player.auth = getAuth(player.id)
    state.afkList = state.afkList.filter((p) => p[0] != player.id)
    state.inactivityTicks[player.id] = 0
    room.sendAnnouncement(
        `${player.name} ID: ${player.auth}`,
        null,
        Color.GR_GREEN,
        "small",
        HaxNotification.NONE
    );
    updateVipSlots()
    updateTeams()
    updateTeamSize()
}

function onPlayerKicked(kickedPlayer, reason, ban, byPlayer) {
    if (byPlayer != null) {
        if (ban && getRole(byPlayer) < Role.MASTER || kickedPlayer.id == byPlayer.id) {
            room.clearBan(kickedPlayer.id);
            room.setPlayerAdmin(byPlayer.id, false)
        }else if (ban && getRole(byPlayer) <= getRole(kickedPlayer) || kickedPlayer.id != byPlayer.id) {
            room.setPlayerAdmin(byPlayer.id, false)
        }
    }
}

function onPlayerTeamChange(changedPlayer, byPlayer) {    
    if (state.afkList.findIndex((p) => p[0] == changedPlayer.id) != -1 && changedPlayer.team != Team.SPECTATORS) {
        room.setPlayerTeam(changedPlayer.id, Team.SPECTATORS);
        room.sendAnnouncement(
            `${changedPlayer.name} АФК!`,
            byPlayer.id,
            Color.GR_RED,
            "small",
            HaxNotification.MENTION
        )
        return
    }
    state.inactivityTicks[changedPlayer.id] = 0
    state.queue[state.queue.findIndex((p) => p[0] == changedPlayer.id)][1] = 0
    if (changedPlayer.team != Team.SPECTATORS && byPlayer == null) {
        room.sendAnnouncement(
            `@${changedPlayer.name} ты в игре!`,
            changedPlayer.id,
            Color.WH_BLUE,
            "bold",
            HaxNotification.MENTION
        )
    }
}

return {
    onPlayerJoin,
    onPlayerLeave,
    onPlayerKicked,
    onPlayerTeamChange
}

};