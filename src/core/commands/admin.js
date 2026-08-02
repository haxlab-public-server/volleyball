module.exports = function createAdminCommands({
    room,
    lastIds,
    muteArray,
    getAuth,
    getConn,
    getRole,
    getOnlyInt,
    stringToTime,
    getStringTime,
    MutePlayer,
    Role,
    Color,
    HaxNotification,
    Discord,
    Telegram,
    fs
}) {

function unBanCommand(player, message) {
    // TODO: migrate from fs to sqlite in the future
    var banList = JSON.parse(fs.readFileSync('bans.json', 'utf8'));
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length == 1 && msgArray[0].length == 43) {
        if (banList.findIndex((p) => p["auth"] == msgArray[0]) != -1) {
            var index = banList.findIndex((p) => p["auth"] == msgArray[0])
            if (banList[index]["id"] != null) {
                room.clearBan(banList[index]["id"])
                room.sendAnnouncement(
                    `${player.name} разбанил ${
                        banList[index]["name"]
                    }`,
                    null,
                    Color.RED,
                    "bold",
                    HaxNotification.NONE
                );
            } else {
                room.sendAnnouncement(
                    `${player.name} разбанил ${
                        banList[index]["auth"]
                    }`,
                    null,
                    Color.RED,
                    "bold",
                    HaxNotification.NONE
                );
            }
            banList = banList.filter((p) => p["auth"] != banList[index]["auth"]);
            // TODO: migrate from fs to sqlite in the future
            fs.writeFileSync('bans.json', JSON.stringify(banList))
        } else {
            room.sendAnnouncement(
                `Введенный вами идентификатор не связан с баном`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    } else if (msgArray.length == 1) {
        if (getOnlyInt(msgArray[0]) >= 0) {
            // TODO: migrate from fs to sqlite in the future
            var banList = JSON.parse(fs.readFileSync('bans.json', 'utf8'));
            var ID = getOnlyInt(msgArray[0]);
            if (banList.length != banList.filter((p) => p["auth"] != banList[ID]["auth"]).length) {
                if (banList[ID]["id"] != null) {
                    room.clearBan(banList[ID]["id"])
                    room.sendAnnouncement(
                        `${player.name} разбанил ${
                            banList[ID]["name"]
                        }`,
                        null,
                        Color.RED,
                        "bold",
                        HaxNotification.NONE
                    );
                } else {
                    room.sendAnnouncement(
                        `${player.name} разбанил ${
                            banList[ID]["auth"]
                        }`,
                        null,
                        Color.RED,
                        "bold",
                        HaxNotification.NONE
                    );
                }
                banList = banList.filter((p) => p["auth"] != banList[ID]["auth"]);
                // TODO: migrate from fs to sqlite in the future
                fs.writeFileSync('bans.json', JSON.stringify(banList))
            } else {
                room.sendAnnouncement(
                    `Введенный вами идентификатор не связан с баном`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                );
            }
        } else {
            room.sendAnnouncement(
                `Введен неверный ID`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    } else {
        room.sendAnnouncement(
            `Неверное количество аргументов`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        );
    }
}

function banCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length == 2) {
        if (msgArray[0].length == 43) {
            var ban_auth = msgArray[0]
            if (lastIds[ban_auth] != undefined) {
                var ban_id = lastIds[ban_auth][0]
                var ban_conn = lastIds[ban_auth][1]
            } else if (room.getPlayerList().findIndex((h) => getAuth(h.id) == msgArray[0]) != -1) {
                var ban_id = room.getPlayerList().findIndex((h) => getAuth(h.id) == msgArray[0])
                var ban_conn = getConn(ban_id)
            } else {
                var ban_id = null
                var ban_conn = null
            }
            if (ban_auth == getAuth(player.id) || (getRole({}, ban_auth) >= Role.PREADMIN && getRole(player) != Role.MASTER)) {
                room.sendAnnouncement(
                    `Вы не можете забанить себя или у этого игрока защита от бана`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                );
                return;
            }
            var ban_name = null
        } else if (msgArray[0][0] == "#" && !isNaN(Number(msgArray[0].slice(1)))) {
            var ban_id = Number(msgArray[0].slice(1))
            var ban_pl = room.getPlayer(ban_id)
            if (ban_id == player.id || (getRole(ban_pl) >= Role.PREADMIN && getRole(player) != Role.MASTER)) {
                room.sendAnnouncement(
                    `Вы не можете забанить себя или у этого игрока защита от бана`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                );
                return;
            }
            var ban_auth = getAuth(ban_id)
            var ban_conn = getConn(ban_id)
            var ban_name = ban_pl.name != undefined ? ban_pl.name : null
        } else {
            room.sendAnnouncement(
                `Введен неверный ID`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
            return;
        }
        var time = stringToTime(msgArray[1])
        if (time != null) {
            if (getRole(player) == Role.PREADMIN && time > 30 * 60 * 1000) {
                room.sendAnnouncement(
                    `У вашей роли ограничение на время бана: максимум 30min`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                );
                return false;
            }
            var ban_date = Date.now() + time
            // TODO: migrate from fs to sqlite in the future
            var ban_list = JSON.parse(fs.readFileSync('bans.json', 'utf8'));
            ban_list.push({"id": ban_id, "auth": ban_auth, "conn": ban_conn, "name": ban_name, "date": ban_date})
            // TODO: migrate from fs to sqlite in the future
            fs.writeFileSync("bans.json", JSON.stringify(ban_list))
            room.sendAnnouncement(
                `${player.name} забанил ${ban_name == null ? ban_auth : ban_name} на ${getStringTime(msgArray[1])} мин`, 
                null, 
                Color.RED, 
                "bold", 
                HaxNotification.MENTION
            );
            var banPlayer = room.getPlayer(ban_id)
            if (banPlayer != null) {
                room.kickPlayer(banPlayer.id, `${player.name} забанил вас на ${getStringTime(msgArray[1])} мин\n discord: ${Discord}\n telegram: ${Telegram}`, true)
            }
        } else {
            room.sendAnnouncement(
                `Нужно написать время в правильном формате (пример: 10min)`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    } else {
        room.sendAnnouncement(
            `Неверное количество аргументов`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        )
    }
}

function banListCommand(player, message) {
    // TODO: migrate from fs to sqlite in the future
    var banList = JSON.parse(fs.readFileSync('bans.json', 'utf8'));
    if (banList.length == 0) {
        room.sendAnnouncement(
            "Никого нет в бан-листе.",
            player.id,
            Color.GR_GREEN,
            "small",
            HaxNotification.NONE
        );
        return false;
    }
    var cstm = "Бан-лист:";
    for (let ban of banList) {
        cstm += ` ${ban["name"] == null ? ban["auth"] : ban["name"]}` + ` (${Math.round((ban["date"] - Date.now())/1000/60)}мин) ` + `[${banList.indexOf(ban)}],`;
    }
    cstm = cstm.substring(0, cstm.length - 1) + ".";
    room.sendAnnouncement(cstm, player.id, Color.GR_GREEN, "small", null);
}

function muteCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length > 0) {
        if (msgArray[0].length > 0 && msgArray[0][0] == "#") {
            msgArray[0] = msgArray[0].substring(1, msgArray[0].length);
            if (room.getPlayer(getOnlyInt(msgArray[0])) != null) {
                var playerMute = room.getPlayer(getOnlyInt(msgArray[0]));
                var timeMute = 5 * 60 * 1000;
                if (msgArray.length > 1 && stringToTime(msgArray[1]) > 0) {
                    timeMute = stringToTime(msgArray[1]);
                    if (timeMute == null) {
                        room.sendAnnouncement(
                            `Нужно написать время в правильном формате (пример: 10min)`,
                            player.id,
                            Color.GR_RED,
                            "small",
                            HaxNotification.CHAT
                        );
                        return false 
                    }
                    if (getRole(player) == Role.PREADMIN && timeMute > 60 * 60 * 1000) {
                        room.sendAnnouncement(
                            `У вашей роли ограничение на время мута: максимум 1h (1 час)`,
                            player.id,
                            Color.GR_RED,
                            "small",
                            HaxNotification.CHAT
                        );
                        return false;
                    }
                } else {
                    room.sendAnnouncement(
                        `Нужно написать время (пример: 10min)`,
                        player.id,
                        Color.GR_RED,
                        "small",
                        HaxNotification.CHAT
                    );
                    return false
                }
                if (getRole(playerMute) < Role.PREADMIN || (getRole(playerMute) >= Role.PREADMIN && getRole(player) == Role.MASTER)) {
                    var muteObj = new MutePlayer(
                        playerMute.name,
                        playerMute.id,
                        getAuth(playerMute.id)
                    );
                    muteObj.setDuration(timeMute);
                    room.sendAnnouncement(
                        `${player.name} замутил ${playerMute.name} на ${getStringTime(msgArray[1])}.`,
                        null,
                        Color.RED,
                        "bold",
                        HaxNotification.NONE
                    );
                } else {
                    room.sendAnnouncement(
                        `У игрока защита от мута.`,
                        player.id,
                        Color.GR_RED,
                        "small",
                        HaxNotification.CHAT
                    );
                }
            } else {
                room.sendAnnouncement(
                    `Игрока с таким ID в руме нет`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                );
            }
        } else {
            room.sendAnnouncement(
                `Неверный формат`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    } else {
        room.sendAnnouncement(
            `Неверное количество аргументов`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        );
    }
}

function unMuteCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length > 0) {
        if (msgArray[0].length > 0 && msgArray[0][0] == "#") {
            msgArray[0] = msgArray[0].substring(1, msgArray[0].length);
            if (room.getPlayer(getOnlyInt(msgArray[0])) != null) {
                var playerUnmute = room.getPlayer(getOnlyInt(msgArray[0]));
                if (muteArray.getByPlayerId(playerUnmute.id) != null) {
                    var muteObj = muteArray.getByPlayerId(playerUnmute.id);
                    muteArray.removeById(muteObj.id)
                    room.sendAnnouncement(
                        `${player.name} размутил ${playerUnmute.name}!`,
                        null,
                        Color.RED,
                        "bold",
                        HaxNotification.CHAT
                    );
                } else {
                    room.sendAnnouncement(
                        `Этот игрок не в муте!`,
                        player.id,
                        Color.GR_RED,
                        "small",
                        HaxNotification.CHAT
                    );
                }
            } else {
                room.sendAnnouncement(
                    `Игрока с таким ID в руме нет`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                );
            }
        } else if (
            msgArray[0].length > 0 &&
            getOnlyInt(msgArray[0]) > 0 &&
            muteArray.getById(getOnlyInt(msgArray[0])) != null
        ) {
            var playerUnmute = muteArray.getById(getOnlyInt(msgArray[0]));
            muteArray.removeById(getOnlyInt(msgArray[0]));
            room.sendAnnouncement(
                `${player.name} размутил ${playerUnmute.name}!`,
                null,
                Color.RED,
                "bold",
                HaxNotification.CHAT
            );
        } else {
            room.sendAnnouncement(
                `Неверный формат`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    } else {
        room.sendAnnouncement(
            `Неверное количество аргументов`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        );
    }
}

function muteListCommand(player, message) {
    if (muteArray.list.length == 0) {
        room.sendAnnouncement(
            "В мут-листе пусто.",
            player.id,
            Color.GR_GREEN,
            "small",
            HaxNotification.NONE
        );
        return false;
    }
    var cstm = "Мут-лист: ";
    for (let mute of muteArray.list) {
        cstm += mute.name + ` (${Math.round((mute.unmuteDate - Date.now())/1000/60)}мин)` +`[${mute.id}],`;
    }
    cstm = cstm.substring(0, cstm.length - 1) + ".";
    room.sendAnnouncement(cstm, player.id, Color.GR_GREEN, "small", null);
}

return {
    unBanCommand,
    banCommand,
    banListCommand,
    muteCommand,
    unMuteCommand,
    muteListCommand
}

};