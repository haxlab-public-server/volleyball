module.exports = function createPlayerCommands({
    room,
    state,
    fs,
    getAuth,
    getRole,
    getOnlyInt,
    getTeamArray,
    sendAnnouncementTeam,
    getStatTime,
    updateTeams,
    updateTeamSize,
    getCommands,
    Role,
    Mods,
    Team,
    Color,
    HaxNotification,
    Discord,
    Telegram,
    vipQueueRoles
}) {

function teamChatCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    var emoji =
        player.team == 1 ? "🔴" : player.team == 2 ? "🔵" : "⚪";
    var message = `${emoji} [TEAM] ${player.name}: ${msgArray.join(" ")}`;
    var team = getTeamArray(player.team);
    var color =
        player.team == 1
            ? Color.TEAM_RED
            : player.team == 2
            ? Color.TEAM_BLUE
            : null;
    var style = "bold";
    var mention = 1;
    sendAnnouncementTeam(message, team, color, style, mention);
}

function helpCommand(player, message) {
    const commands = getCommands();
    var commandString = "Доступные вам команды:"
    for (const [key, value] of Object.entries(commands)) {
        if (value.roles <= getRole(player))
            commandString += ` !${key},`;
    }
    commandString = commandString.substring(0, commandString.length - 1) + ".";
    room.sendAnnouncement(
        commandString,
        player.id,
        Color.GR_GREEN,
        "small",
        HaxNotification.CHAT
    )
}

function admCommand(player) {
    player.auth = getAuth(player.id)
    if (state.mode == Mods.PRIVATE && getRole(player) < Role.VIP && room.getPlayerList().filter(plr => plr.admin == true).length == 0) {
        room.setPlayerAdmin(player.id, true);
    } else if (state.mode == Mods.PRIVATE && getRole(player) >= Role.VIP) {
        room.setPlayerAdmin(player.id, true);
    } else if (getRole(player) >= Role.PREADMIN) {
        room.setPlayerAdmin(player.id, true);
    }
}

function serveCommand(player) {
    if (!state.training_mode) {
        if (player.team != Team.SPECTATORS) {
            if (getTeamArray(Team.BLUE).length >= state.game.teamSize && getTeamArray(Team.RED).length >= state.game.teamSize) {
                if (state.lastTouches[0] == undefined) {
                    if (state.serveBall != true) {
                        if (player.team == Team.BLUE && state.serve == Team.BLUE) {
                            setTimeout(() => {
                                state.serveBall = true
                                room.setDiscProperties(0, {
                                    x: 410,
                                    y: 200,
                                    xspeed: -0.7,
                                    yspeed: -11.9,
                                })
                            }, 300)
                        } else if (player.team == Team.RED && state.serve == Team.RED) {
                            setTimeout(() => {
                                state.serveBall = true
                                room.setDiscProperties(0, {
                                    x: -410,
                                    y: 200,
                                    xspeed: 0.7,
                                    yspeed: -11.9,
                                })
                            }, 300)
                        } else {
                            room.sendAnnouncement(
                                `Сейчас не ваша подача`,
                                player.id,
                                Color.GR_RED,
                                "small",
                                HaxNotification.MENTION
                            ) 
                        }
                    } else {
                        room.sendAnnouncement(
                            `Кто-то уже делает подачу`,
                            player.id,
                            Color.GR_RED,
                            "small",
                            HaxNotification.MENTION
                        ) 
                    }
                } else {
                    room.sendAnnouncement(
                        `Сейчас нельзя сделать подачу`,
                        player.id,
                        Color.GR_RED,
                        "small",
                        HaxNotification.MENTION
                    )
                }
            } else {
                room.sendAnnouncement(
                    `Недостаточно игроков на поле для силовой подачи`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.MENTION
                )
            }
        } else {
            room.sendAnnouncement(
                `Вы должны быть в игре, чтобы сделать подачу`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.MENTION
            )
        }
    } else {
        room.sendAnnouncement(
            `чтобы тренировать подачу в тренинг моде используй !bs serve_red или !bs serve_blue`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.MENTION
        ) 
    }
}

function bbCommand(player) {
    room.kickPlayer(player.id, `Пока!`, false);
}

function statsCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    // TODO: migrate from fs to sqlite in the future
    var stats = JSON.parse(fs.readFileSync('stats.json', 'utf8'));
    if (msgArray.length == 0) {
        var id = player.id
    } else if (msgArray[0][0] != "@") {
        if (msgArray[0][0] == "#") {
            var id = Number(msgArray[0].slice(1))
        } else {
            var id = Number(msgArray[0])
        }
    } else if (msgArray[0][0] == "@") {
        var pname = msgArray[0].slice(1).replace(/_/g, ' ');
        var id = NaN
    }
    if (!isNaN(id)) {
        if (room.getPlayer(id) != null) {
            var auth = getAuth(id)
            var stat = stats[auth]
            if (stat != undefined) {
                room.sendAnnouncement(
                    `📊${stat[0]} - Игры: ${stat[1]}, Победы: ${stat[2]} (${isNaN((stat[2]/stat[1]*100).toFixed(1)) ? "0" : +(stat[2]/stat[1]*100).toFixed(1)}%), ` + 
                    `Голы: ${stat[3]}, ПОБ: ${isNaN((stat[3]/(stat[3]+stat[6])*100).toFixed(1)) ? "0" : +(stat[3]/(stat[3]+stat[6])*100).toFixed(1)}% (из ${stat[3]+stat[6]}), ` +
                    `Блоки: ${stat[4]}, Пасы: ${stat[5]}, Ошибки: ${stat[7]} (${isNaN((stat[1] / stat[7]).toFixed(1)) ? "0" : +(stat[7] / stat[1]).toFixed(1)}/игра), Подачи: ${stat[9]}, ` +
                    `ЭЙСы: ${stat[8]} (${isNaN((stat[8]/stat[9]*100).toFixed(1)) ? "0" : +(stat[8]/stat[9]*100).toFixed(1)}%), Время: ${getStatTime(stat[10])}` +
                    `\nПОБ - Процент Обойдённых Блоков (чем ниже процент, тем больше ваших атак было заблокированно)`,
                    player.id,
                    Color.WH_BLUE,
                    "small",
                    HaxNotification.CHAT
                );
            } else {
                room.sendAnnouncement(
                    `Вас нет в статистике сыграйте хотя бы одну игру!`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                );
            }
        } else {
            room.sendAnnouncement(
                `Игрок должен быть на сервере, чтобы вы могли посмотреть его статистику`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    } else if (isNaN(id) && pname != undefined) {
        var obks = Object.keys(stats)
        var obvs = Object.values(stats)
        var pn_index = obvs.findIndex((x) => x[0].toLowerCase().replace(/_/g, ' ') == pname.toLowerCase())
        if (pn_index != -1) {
            arr = []
            for (var l = 0; l < obvs.length; l++) {
                if (obvs[l][0].toLowerCase().replace(/_/g, ' ') == pname.toLowerCase()) {
                    arr.push([obks[l], stats[obks[l]]])
                }
            }
            if (arr.length > 1 && (msgArray[1] == undefined || isNaN(msgArray[1]))) {
                // TODO: migrate from fs to sqlite in the future
                var deanon = JSON.parse(fs.readFileSync('nicknames.json', 'utf8'));
                var names = ``
                for (var o = 0; o < arr.length; o++) {
                    names += `\n${o+1}) ${deanon[arr[o][0]]}`
                }
                room.sendAnnouncement(
                    `Игроков с таким именем в статистике ${arr.length}, введите команду ещё раз, но после имени введите номер нужного вам\nВот их имена из deanon команды:${names}`,
                    player.id,
                    Color.WH_BLUE,
                    "small",
                    HaxNotification.CHAT
                );
                return;
            } else if (arr.length == 1) {
                var stat = stats[obks[pn_index]]
            } else {
                var stat = stats[arr[Number(msgArray[1])-1][0]]
            }
            if (stat != undefined) {
                room.sendAnnouncement(
                    `📊${stat[0]} - Игры: ${stat[1]}, Победы: ${stat[2]} (${isNaN((stat[2]/stat[1]*100).toFixed(1)) ? "0" : +(stat[2]/stat[1]*100).toFixed(1)}%), ` + 
                    `Голы: ${stat[3]}, ПОБ: ${isNaN((stat[3]/(stat[3]+stat[6])*100).toFixed(1)) ? "0" : +(stat[3]/(stat[3]+stat[6])*100).toFixed(1)}% (из ${stat[3]+stat[6]}), ` +
                    `Блоки: ${stat[4]}, Пасы: ${stat[5]}, Ошибки: ${stat[7]} (${isNaN((stat[1] / stat[7]).toFixed(1)) ? "0" : +(stat[7] / stat[1]).toFixed(1)}/игра), Подачи: ${stat[9]}, ` +
                    `ЭЙСы: ${stat[8]} (${isNaN((stat[8]/stat[9]*100).toFixed(1)) ? "0" : +(stat[8]/stat[9]*100).toFixed(1)}%), Время: ${getStatTime(stat[10])}` +
                    `\nПОБ - Процент Обойдённых Блоков (чем ниже процент, тем больше ваших атак было заблокированно)`,
                    player.id,
                    Color.WH_BLUE,
                    "small",
                    HaxNotification.CHAT
                );
            } else {
                room.sendAnnouncement(
                    `Игрока нет в статистике он должен сыграть хотя бы одну игру!`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                );
            }
        } else {
            room.sendAnnouncement(
                `Игрока с таким именем нет в статистике`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    } else {
        room.sendAnnouncement(
            `Некорректный параметр, введите айди игрока если он на сервере или его @никнейм`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        );
    }
}

function renameCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    // TODO: migrate from fs to sqlite in the future
    var stat = JSON.parse(fs.readFileSync('stats.json', 'utf8'));
    if (stat[getAuth(player.id)]) {
        var stats = stat[getAuth(player.id)];
        if (msgArray.length == 0) {
            stats[0] = player.name;
        } else {
            stats[0] = msgArray.join(" ");
        }
        stat[getAuth(player.id)] = stats;
        // TODO: migrate from fs to sqlite in the future
        fs.writeFileSync('stats.json', JSON.stringify(stat));
        room.sendAnnouncement(
            `Вы успешно переименовали себя ${stats[0]} !`,
            player.id,
            Color.GR_GREEN,
            "bold",
            HaxNotification.CHAT
        );
    } else {
        room.sendAnnouncement(
            `Ошибка!`,
            player.id,
            Color.GR_RED,
            "bold",
            HaxNotification.CHAT
        );
    }
}

var tops = {
    "games": 1,
    "wins": 2,
    "goals": 3,
    "blocks": 4,
    "assists": 5,
    "aces": 8,
    "time": 10
}

function topsCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length >= 1) {
        var top = msgArray[0].toLowerCase()
        if (top in tops) {
            if (msgArray.length >= 2) {
                var len = +msgArray[1]
                if (len < 5 || len > 50) {
                    room.sendAnnouncement(
                        `Некорректная длина топа, min: 5 max: 50`,
                        player.id,
                        Color.GR_RED,
                        "small",
                        HaxNotification.CHAT
                    );
                    return
                }
            } else {
                var len = 10
            }
            // TODO: migrate from fs to sqlite in the future
            var stats = JSON.parse(fs.readFileSync('stats.json', 'utf8'));
            var statsArr = []
            var obks = Object.keys(stats)
            for (var k = 0; k < obks.length; k++) {
                var key = obks[k]
                if (stats[key][1] >= 5) {
                    statsArr.push(stats[key])
                }
            }
            if (statsArr.length >= len) {
                statsArr.sort(function (a, b) {
                    return b[tops[top]] - a[tops[top]];
                });
                var resultString = `${top} -`
                if (top != "time") {
                    for (var n = 0; n < len; n++) {
                        resultString += ` ${n+1}. ${statsArr[n][0]} (${statsArr[n][tops[top]]})`
                    }
                } else {
                    for (var n = 0; n < len; n++) {
                        resultString += ` ${n+1}. ${statsArr[n][0]} (${getStatTime(statsArr[n][tops[top]])})`
                    }
                }
                room.sendAnnouncement(
                    resultString,
                    player.id,
                    Color.WH_BLUE,
                    "small",
                    HaxNotification.CHAT
                );
            } else {
                room.sendAnnouncement(
                    `Недостаточно игроков в топе: ещё ${len - statsArr.length}`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                );
            }
        } else {
            room.sendAnnouncement(
                `Некорректный топ: "games", "wins", "goals", "blocks", "assists", "aces", "time"\nПример - !tops goals`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    } else {
        room.sendAnnouncement(
            `Некорректный топ: "games", "wins", "goals", "blocks", "assists", "aces", "time"\nПример - !tops goals`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        );
    }
}

function getAuthCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray[0] != null && msgArray[0][0] == "#") {
        msgArray[0] = msgArray[0].substring(1, msgArray[0].length);
        if (room.getPlayer(getOnlyInt(msgArray[0])) != null) {
            var plAuth = room.getPlayer(getOnlyInt(msgArray[0]));
            plAuth.auth = getAuth(plAuth.id);
            room.sendAnnouncement(
                `${plAuth.name} ID: ${plAuth.auth}`,
                player.id,
                Color.WH_BLUE,
                "small-italic",
                HaxNotification.CHAT
            );
        } else {
            room.sendAnnouncement(
                `Игрока с таким ID не существует`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            );
        }
    } else if (msgArray[0] == null) {
        room.sendAnnouncement(
            `${player.name} ID: ${getAuth(player.id)}`,
            player.id,
            Color.WH_BLUE,
            "small-italic",
            HaxNotification.CHAT
        );
    } else {
        room.sendAnnouncement(
            `Неверный формат! ("!getauth #ID")`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        );
    }
}

function queueCommand(player) {
    if (state.queue.length > 0) {
        state.queue.sort(function (a, b) {
            return b[1] - a[1];
        });
        realQueue = state.queue.filter(l => state.afkList.findIndex((p) => p[0] == l[0]) == -1)
        vipQueue = realQueue.filter(k => vipQueueRoles.includes(getRole(room.getPlayer(k[0]))) == true)
        if (realQueue.length > 0) {
             var resultString = "📝Очередь (игрок [пропущ. игр]):"
            for (var i of realQueue) {
                resultString += ` ${room.getPlayer(i[0]).name} [${i[1]}],`
            }
            resultString = resultString.substring(0, resultString.length - 1) + ".";
        } else {
            var resultString = "📝В очереди никого нет"
        }
        if (vipQueue.length > 0) {
            resultString += "\n🌟VIP-Очередь (игрок [пропущ. игр]):"
            for (var j of vipQueue) {
                resultString += ` ${room.getPlayer(j[0]).name} [${j[1]}],`
            }
            resultString = resultString.substring(0, resultString.length - 1) + ".";
        } else {
            resultString += "\n🌟В VIP-Очереди никого нет"
        }
        room.sendAnnouncement(
            `${resultString}`,
            player.id,
            Color.GR_GREEN,
            "small",
            HaxNotification.CHAT
        )
    } else {
        room.sendAnnouncement(
            `📝В очереди никого нет`,
            player.id,
            Color.GR_GREEN,
            "small",
            HaxNotification.CHAT
        )
    }
}

function discordCommand(player, message) {
    room.sendAnnouncement(
        `Наш discord: ${Discord}`,
        player.id,
        Color.GR_GREEN,
        "small",
        HaxNotification.CHAT
    )
}

function telegramCommand(player, message) {
    room.sendAnnouncement(
        `Мой telegram: ${Telegram}`,
        player.id,
        Color.GR_GREEN,
        "small",
        HaxNotification.CHAT
    )
}
    
function afkCommand(player) {
    if (state.afkList.findIndex((p) => p[0] == player.id) != -1) {
        state.afkList = state.afkList.filter((p) => p[0] != player.id)
        room.sendAnnouncement(
            `🐣${player.name} больше не АФК`,
            null,
            Color.WH_BLUE,
            "small",
            HaxNotification.CHAT
        )
    } else {
        if (player.team != Team.SPECTATORS) {
            room.setPlayerTeam(player.id, Team.SPECTATORS);
        }
        state.afkList.push([player.id, player.name, Date.now()])
        room.sendAnnouncement(
            `💤${player.name} теперь АФК`,
            null,
            Color.WH_BLUE,
            "small",
            HaxNotification.CHAT
        )
    }
    updateTeams()
    updateTeamSize()
}

function afkListCommand(player) {
    if (state.afkList.length != 0) {
        var resultString = "💤Список АФК:"
        for (var i of state.afkList) {
            resultString += ` ${i[1]} (${Math.ceil((Date.now() - i[2]) / 1000 / 60)}мин),`
        }
        resultString = resultString.substring(0, resultString.length - 1) + ".";
        room.sendAnnouncement(
            `${resultString}`,
            player.id,
            Color.GR_GREEN,
            "small",
            HaxNotification.CHAT
        )
    } else {
        room.sendAnnouncement(
            `💤В списке АФК никого нет`,
            player.id,
            Color.GR_GREEN,
            "small",
            HaxNotification.CHAT
        )
    }
}

function idsCommand(player) {
    var resultString = "📑player (id):"
    var plrs = room.getPlayerList()
    for (var i of plrs) {
        resultString += ` ${i.name} (${i.id}),`
    }
    resultString = resultString.substring(0, resultString.length - 1) + ".";
    room.sendAnnouncement(
        `${resultString}`,
        player.id,
        Color.GR_GREEN,
        "small",
        HaxNotification.CHAT
    )
}

function deanonCommand(player, message) {
    var msgArray = message.split(/ +/).slice(1);
    if (msgArray.length != 0) {
        // TODO: migrate from fs to sqlite in the future
        var deanon = JSON.parse(fs.readFileSync('nicknames.json', 'utf8'));
        if (msgArray[0][0] == "#") {
            var id = Number(msgArray[0].slice(1))
        } else {
            var id = Number(msgArray[0])
        }
        var dplayer = room.getPlayer(id) 
        if (dplayer != null) {
            if (getAuth(dplayer.id) in deanon) {
                let resultString = `🔍${dplayer.name} также известен как: `
                names = deanon[getAuth(dplayer.id)]
                for (let i of names) {
                    resultString += `${i}, `
                }
                resultString = resultString.slice(0, -2)
                resultString += "."
                room.sendAnnouncement(
                    `${resultString}`,
                    player.id,
                    null,
                    "small",
                    HaxNotification.CHAT
                )
            } else {
                room.sendAnnouncement(
                    `Ошибка, невозможно узнать имена игрока`,
                    player.id,
                    Color.GR_RED,
                    "small",
                    HaxNotification.CHAT
                )
            }
        } else {
            room.sendAnnouncement(
                `Игрока нет на сервере`,
                player.id,
                Color.GR_RED,
                "small",
                HaxNotification.CHAT
            )
        }
    } else {
        room.sendAnnouncement(
            `Напишите айди игрока`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        )
    }
}

function myPointCommand(player, message) {
    if (player.team != Team.SPECTATORS && room.getScores() != null) {
        var prop = room.getPlayerDiscProperties(player.id)
        room.sendAnnouncement(
            `x: ${+prop.x.toFixed(2)} y: ${+prop.y.toFixed(2)}`,
            player.id,
            Color.WH_BLUE,
            "small",
            HaxNotification.CHAT
        )
    } else {
        room.sendAnnouncement(
            `Команду можно использовать только на поле`,
            player.id,
            Color.GR_RED,
            "small",
            HaxNotification.CHAT
        )
    }
}

return {
    teamChatCommand,
    helpCommand,
    admCommand,
    serveCommand,
    bbCommand,
    statsCommand,
    renameCommand,
    topsCommand,
    getAuthCommand,
    queueCommand,
    discordCommand,
    telegramCommand,
    afkCommand,
    afkListCommand,
    idsCommand,
    deanonCommand,
    myPointCommand
}

};