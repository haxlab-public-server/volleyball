module.exports = function createMasterCommands({
    room,
    state,
    fs,
    getAuth,
    getRole,
    setRole,
    stringToTime,
    getStringTime,
    getDate,
    Role,
    RoleString,
    Mods,
    Color,
    HaxNotification
}) {

function passwordCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length == 0 || msgArray[0] == "clear") {
        state.roomPassword = null
        room.setPassword(state.roomPassword)
        room.sendAnnouncement(
            `Пароль был сброшен - ${player.name}`,
            null,
            Color.WH_GREEN,
            "small",
            HaxNotification.CHAT
        );
    } else {
        state.roomPassword = msgArray[0]
        room.setPassword(state.roomPassword)
        room.sendAnnouncement(
            `Теперь пароль от комнаты: ${msgArray[0]} - ${player.name}`,
            null,
            Color.WH_GREEN,
            "small",
            HaxNotification.CHAT
        );
    }
}

function addAuthCommand (player, message) {
    // TODO: migrate from fs to sqlite in the future
    var auths = JSON.parse(fs.readFileSync('auths.json', 'utf8'));
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length != 0 && msgArray[0].length == 43) {
        if (auths.findIndex((p) => p == msgArray[0]) == -1) {
            auths.push(msgArray[0])
            room.sendAnnouncement(
                `${msgArray[0]} был добавлен в список авторизированных игроков`,
                player.id,
                Color.WH_BLUE,
                "small",
                HaxNotification.CHAT
            )
        } else {
            room.sendAnnouncement(
                `Этот паблик уже в списке`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    } else {
        room.sendAnnouncement(
            `Ошибка. Нужно написать паблик айди`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        );
    }
    // TODO: migrate from fs to sqlite in the future
    fs.writeFileSync("auths.json", JSON.stringify(auths))
}

function deleteAuthCommand (player, message) {
    // TODO: migrate from fs to sqlite in the future
    var auths = JSON.parse(fs.readFileSync('auths.json', 'utf8'));
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length != 0 && msgArray[0].length == 43) {
        if (auths.findIndex((p) => p == msgArray[0]) != -1) {
            auths.splice(auths.findIndex((p) => p == msgArray[0]), 1)
            room.sendAnnouncement(
                `${msgArray[0]} был удалён из списка авторизированных игроков`,
                player.id,
                Color.WH_BLUE,
                "small",
                HaxNotification.CHAT
            )
        } else {
            room.sendAnnouncement(
                `Этого паблика нет в списке`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    } else {
        room.sendAnnouncement(
            `Ошибка. Нужно написать паблик айди`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        );
    }
    // TODO: migrate from fs to sqlite in the future
    fs.writeFileSync("auths.json", JSON.stringify(auths))
}

function clearAuthsCommand (player, message) {
    // TODO: migrate from fs to sqlite in the future
    var auths = JSON.parse(fs.readFileSync('auths.json', 'utf8'));
    auths = []
    // TODO: migrate from fs to sqlite in the future
    fs.writeFileSync("auths.json", JSON.stringify(auths))
    room.sendAnnouncement(
        `Список авторизированных игроков был очищен`,
        player.id,
        Color.WH_BLUE,
        "small",
        HaxNotification.CHAT
    )
}

function joinAuthsCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length == 0 || msgArray[0] == "mode") {
        room.sendAnnouncement(
            `Сейчас вход только авторизированных игроков: ${state.joinAuths == true ? "включён" : "выключен"}`,
            player.id,
            Color.WH_GREEN,
            "small",
            HaxNotification.CHAT
        );
    } else if (msgArray.length != 0 && (msgArray[0] == "on" || msgArray[0] == "true" || msgArray[0] == "off" || msgArray[0] == "false")) {
        if (msgArray[0] == "on" || msgArray[0] == "true") {
            state.joinAuths = true
            room.sendAnnouncement(
                `Вход только авторизированых игроков включён - ${player.name}`,
                null,
                Color.WH_GREEN,
                "small",
                HaxNotification.CHAT
            );
        } else {
            state.joinAuths = false
            room.sendAnnouncement(
                `Вход только авторизированых игроков выключен - ${player.name}`,
                null,
                Color.WH_GREEN,
                "small",
                HaxNotification.CHAT
            );
        }
    } else {
        room.sendAnnouncement(
            `Ошибка. Ты написал какую то хуйню`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        );
    }
}

function modeCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length == 0 || msgArray[0] == "list") {
        var resultString = ``
        for (var e of Object.keys(Mods)) {
            resultString += ` ${e.toLowerCase()},`
        }
        resultString = resultString.substring(0, resultString.length - 1) + ".";
        room.sendAnnouncement(
            `Список модов работы комнаты:${resultString}`,
            player.id,
            Color.WH_BLUE,
            "small",
            HaxNotification.CHAT
        );
    } else {
        if (msgArray[0].toUpperCase() in Mods && Mods[msgArray[0].toUpperCase()] != state.mode) {
            state.mode = Mods[msgArray[0].toUpperCase()]
            room.sendAnnouncement(
                `Теперь мод комнаты: ${msgArray[0].toLowerCase()}`,
                player.id,
                Color.WH_GREEN,
                "small",
                HaxNotification.CHAT
            );
        } else if (Mods[msgArray[0].toUpperCase()] == state.mode) {
            room.sendAnnouncement(
                `Этот мод уже стоит`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        } else {
            room.sendAnnouncement(
                `Некорректное название мода, "!mode list" - чтобы узнать список доступных модов комнаты`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    }
}

function statsResetCommand(player, message) {
    let opana = {}
    // TODO: migrate from fs to sqlite in the future
    fs.writeFileSync("stats.json", JSON.stringify(opana))
    room.sendAnnouncement(
        `Статистика была сброшена`,
        null,
        Color.WH_GREEN,
        "small",
        HaxNotification.MENTION
    );
}

function matchPointCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length != 0) {
        if (msgArray[0] == "info") {
            room.sendAnnouncement(
                `Текущая игра (если идёт) до ${state.newMatchPoint} мячей.`,
                player.id,
                Color.WH_GREEN,
                "small",
                HaxNotification.CHAT
            )
            return
        }
        num = Number(msgArray[0])
        if (!isNaN(num)) {
            state.matchPoint = num
            room.sendAnnouncement(
                `Теперь игра идёт до ${num} мячей! Изменения войдут в силу со следующей игры (если текущая идёт).`,
                player.id,
                Color.WH_GREEN,
                "small",
                HaxNotification.CHAT
            )
        } else {
            room.sendAnnouncement(
                `Некорректное число`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            )
        }
    } else {
        room.sendAnnouncement(
            `Напишите число или "info"`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        )
    }
}

function teamSizeCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length != 0) {
        num = Number(msgArray[0])
        if (!isNaN(num)) {
            state.teamSize = num
            room.sendAnnouncement(
                `Теперь режим игры ${num}x${num}! Изменения войдут в силу со следующей игры (если текущая идёт).`,
                player.id,
                Color.WH_GREEN,
                "small",
                HaxNotification.CHAT
            )
        } else {
            room.sendAnnouncement(
                `Некорректное число`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            )
        }
    } else {
        room.sendAnnouncement(
            `Напишите число`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        )
    }
}

function setRoleCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    var plr = {}
    if (msgArray.length >= 2) {
        if (msgArray[0].length == 43) {
            plr.auth = msgArray[0]
        } else {
            if (msgArray[0][0] == "#") {
                var id = Number(msgArray[0].slice(1))
            } else {
                var id = Number(msgArray[0])
            }
            var check_plr = room.getPlayer(id)
            if (check_plr != null) {
                plr = check_plr
                plr.auth = getAuth(id)
            } else {
                room.sendAnnouncement(
                    `Игрока нет на сервере`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                )
                return false
            }
        }
        // TODO: migrate from fs to sqlite in the future
        var accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf8'));
        var accs_keys = Object.keys(accounts)
        if (plr.id == player.id || plr.auth == getAuth(player.id)) {
            room.sendAnnouncement(
                `Вы не можете менять роль себе!`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            )
            return false
        }
        if (accs_keys.findIndex(i => i == plr.auth) != -1) {
            if (RoleString[msgArray[1]] == undefined) {
                room.sendAnnouncement(
                    `Некоректная роль: ${Object.keys(RoleString)}`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                )
                return false
            }
            if (RoleString[msgArray[1]] == Role.MASTER) {
                room.sendAnnouncement(
                    `Нельзя выдать мастера командой`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                )
                return false
            }
            if (getRole(plr, plr.auth) != RoleString[msgArray[1]]) {
                if (msgArray.length >= 3) {
                    var date = Date.now() + stringToTime(msgArray[2])
                } else {
                    var date = null
                }
                var role = msgArray[1]
                setRole(plr, role, date, plr.auth)
                room.sendAnnouncement(
                    `${plr.name == undefined ? plr.auth : plr.name} теперь ${role} ${date == null ? "" : "на " + getStringTime(msgArray[2])}`,
                    player.id,
                    Color.RED,
                    "small",
                    HaxNotification.CHAT
                )
            } else {
                room.sendAnnouncement(
                    `У игрока и так эта роль`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                )
            }
        } else {
            room.sendAnnouncement(
                `Аккаунт игрока не найден`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            )
        }
    } else {
        room.sendAnnouncement(
            `Недостаточно аргументов`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        )
    }
}

function getRoleListCommand(player, message) {
    var msgArray = message.toLowerCase().split(/ +/).slice(1);
    // TODO: migrate from fs to sqlite in the future
    var accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf8'))
    if (msgArray.length == 1) {
        if (RoleString[msgArray[0]] == undefined) {
            room.sendAnnouncement(
                `Некоректная роль: ${Object.keys(RoleString)}`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            )
            return false
        }
        var listArr = []
        var num = 0
        let acc_values = Object.values(accounts)
        for (let i of acc_values) {
            if (i.role == msgArray[0]) {
                listArr.push([num, i.nickname])
                num++
            }
        }
        let resultString = `${msgArray[0].toUpperCase()} LIST:`
        var numov = 0
        for (let g of listArr) {
            resultString += ` [${g[0]}] ${g[1]},`
            numov++
            if (numov == 50) {
                numov = 0
                room.sendAnnouncement(
                    resultString,
                    player.id,
                    Color.GR_GREEN,
                    "small",
                    HaxNotification.NONE
                )
                resultString = ``
            }
        }
        resultString = resultString.substring(0, resultString.length - 1) + ".";
        room.sendAnnouncement(
            resultString,
            player.id,
            Color.GR_GREEN,
            "small",
            HaxNotification.CHAT
        )
    } else if (msgArray.length >= 2) {
        var valList = Object.values(accounts).filter(j => j.role == msgArray[0])
        var keys = Object.keys(accounts).filter(j => accounts[j].role == msgArray[0])
        if (valList[Number(msgArray[1])] == undefined) {
            room.sendAnnouncement(
                `Такого айди нет в списке`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            )
            return false
        }
        var obj = valList[Number(msgArray[1])]
        var public = keys[Number(msgArray[1])]
        if (obj.date != null) {
            var to_date = getDate(obj.date)
        } else {
            var to_date = `бессрочно`
        }
        room.sendAnnouncement(
            `📋${obj.nickname}:\npublic_id: ${public}\nrole: ${obj.role}\nto_date: ${to_date}\ndiscord: ${obj.discord}`,
            player.id,
            Color.WH_BLUE,
            "small",
            HaxNotification.CHAT
        )
    } else {
        room.sendAnnouncement(
            `Недостаточно аргументов`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        )
    }
}

return {
    passwordCommand,
    addAuthCommand,
    deleteAuthCommand,
    clearAuthsCommand,
    joinAuthsCommand,
    modeCommand,
    statsResetCommand,
    matchPointCommand,
    teamSizeCommand,
    setRoleCommand,
    getRoleListCommand
}

};