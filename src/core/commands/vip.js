module.exports = function createVipCommands({
    room,
    state,
    fs,
    getAuth,
    ballSpawner,
    noGoal_map,
    Mods,
    Color,
    HaxNotification
}) {

function chatColorCommand(player, message) {
    var msgArray = message.toLowerCase().split(/ +/).slice(1);
    player.auth = getAuth(player.id)
    if (msgArray.length > 0) {
        // TODO: migrate from fs to sqlite in the future
        var accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf8'));
        if (msgArray[0] != "clear") {
            accounts[player.auth]["chat_color"] = msgArray[0]
            room.sendAnnouncement(
                `Теперь у вас вот такой цвет чата! \nВыключить цветной чат: !color clear`,
                player.id,
                `0x${msgArray[0]}`,
                "small",
                HaxNotification.CHAT
            )
        } else {
            accounts[player.auth]["chat_color"] = null
            room.sendAnnouncement(
                `Цвет чата был выключен!`,
                player.id,
                Color.WH_GREEN,
                "small",
                HaxNotification.CHAT
            )
        }
        // TODO: migrate from fs to sqlite in the future
        fs.writeFileSync("accounts.json", JSON.stringify(accounts))
    } else {
        room.sendAnnouncement(
            `Нужно написать цвет в HEX формате: FFFFFF (это белый)`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        )
    }
}

function trainingSettingCommands(player, message) {
    if (state.training_mode) {
        var msgArray = message.split(/ +/).slice(1);
        if (msgArray.length == 5) {
            var sett = []
            for (var i of msgArray) {
                if (!isNaN(+i)) {
                    sett.push(i)
                } else {
                    room.sendAnnouncement(
                        `Некорректный вид аргуметов: x, y, xspeed, yspeed, interval`,
                        player.id,
                        Color.GR_RED,
                        "small",
                        HaxNotification.CHAT
                    )
                    return;
                }
            }
            room.sendAnnouncement(
                `Настройки спавна мяча: ${sett.join(" ")} (x, y, xspeed, yspeed, interval) - ${player.name}`,
                null,
                Color.WH_GREEN,
                "small",
                HaxNotification.CHAT
            );
            state.training_mode_spawn = []
            state.training_mode_spawn = sett
            clearInterval(state.training_interval)
            state.training_interval = setInterval(() => { 
                ballSpawner(state.training_mode_spawn)
            }, state.training_mode_spawn[4])
        } else if (msgArray[0] == undefined || msgArray[0] == "info")  { 
            room.sendAnnouncement(
                `Настройки спавна мяча: ${state.training_mode_spawn.length == 0 ? "выключен" : state.training_mode_spawn.join(" ") + " (x, y, xspeed, yspeed, interval)"}`,
                player.id,
                Color.WH_BLUE,
                "small",
                HaxNotification.CHAT
            );
        } else if (msgArray[0] != undefined && msgArray[0] == "off") {
            state.training_mode_spawn = []
            room.sendAnnouncement(
                `Спавн мяча выключен - ${player.name}`,
                null,
                Color.WH_GREEN,
                "small",
                HaxNotification.CHAT
            );
            clearInterval(state.training_interval)
        } else if (msgArray[0] != undefined && msgArray[0] == "serve_red") {
            state.training_mode_spawn = []
            if (!isNaN(+msgArray[1])) {
                state.training_mode_spawn = [-410, 200, 0.7, -11.9, +msgArray[1], "serve_red"]
            } else {
                state.training_mode_spawn = [-410, 200, 0.7, -11.9, 3000, "serve_red"]
            }
            room.sendAnnouncement(
                `Настройки спавна мяча: ${state.training_mode_spawn.join(" ")} (x, y, xspeed, yspeed, interval) - ${player.name}`,
                null,
                Color.WH_GREEN,
                "small",
                HaxNotification.CHAT
            );
            clearInterval(state.training_interval)
            state.training_interval = setInterval(() => { 
                ballSpawner(state.training_mode_spawn)
            }, state.training_mode_spawn[4])
        } else if (msgArray[0] != undefined && msgArray[0] == "serve_blue") {
            state.training_mode_spawn = []
            if (!isNaN(+msgArray[1])) {
                state.training_mode_spawn = [410, 200, -0.7, -11.9, +msgArray[1], "serve_blue"]
            } else {
                state.training_mode_spawn = [410, 200, -0.7, -11.9, 3000, "serve_blue"]
            }
            room.sendAnnouncement(
                `Настройки спавна мяча: ${state.training_mode_spawn.join(" ")} (x, y, xspeed, yspeed, interval) - ${player.name}`,
                null,
                Color.WH_GREEN,
                "small",
                HaxNotification.CHAT
            );
            clearInterval(state.training_interval)
            state.training_interval = setInterval(() => { 
                ballSpawner(state.training_mode_spawn)
            }, state.training_mode_spawn[4])
        } else {
            room.sendAnnouncement(
                `Недостаточно аргументов: x, y, xspeed, yspeed, interval`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            )
        }
    } else {
        room.sendAnnouncement(
            `Режим тренировки выключен, сейчас нельзя использовать эту команду`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        )
    }
}

function trainingCommand(player, message) {
    if (state.mode == Mods.PRIVATE) {
        var msgArray = message.toLowerCase().split(/ +/).slice(1)
        if (msgArray.length == 0 || msgArray[0] == "mode") {
            room.sendAnnouncement(
                `Сейчас режим тренировки: ${state.training_mode == true ? "включён" : "выключен"}`,
                player.id,
                Color.WH_BLUE,
                "small",
                HaxNotification.CHAT
            );
        } else if (msgArray.length != 0 && (msgArray[0] == "on" || msgArray[0] == "true" || msgArray[0] == "off" || msgArray[0] == "false")) {
            if (msgArray[0] == "on" || msgArray[0] == "true") {
                state.training_mode = true
                state.training_mode_spawn = []
                room.sendAnnouncement(
                    `Режим тренировки включён - ${player.name}`,
                    null,
                    Color.WH_GREEN,
                    "small",
                    HaxNotification.CHAT
                );
                room.stopGame()
                room.setCustomStadium(noGoal_map)
                room.startGame()
            } else {
                state.training_mode = false
                state.training_mode_spawn = []
                clearInterval(state.training_interval)
                room.sendAnnouncement(
                    `Режим тренировки выключен - ${player.name}`,
                    null,
                    Color.WH_GREEN,
                    "small",
                    HaxNotification.CHAT
                );
                room.stopGame()
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
    } else {
        room.sendAnnouncement(
            `При public моде нельзя включать режим тренировки вручную`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        )
    }
}

return {
    chatColorCommand,
    trainingSettingCommands,
    trainingCommand
}

};