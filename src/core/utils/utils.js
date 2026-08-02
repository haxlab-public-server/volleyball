module.exports = function createUtils({
    room,
    state,
    lastIds,
    cf,
    Team
}) {

function getAuth(id) { // lastIds = {"auth": [id, conn, auth]}
    let values = Object.values(lastIds)
    let index = values.findIndex(i => i[0] == id)
    return values[index][2]
}

function getConn(id) { // lastIds = {"auth": [id, conn, auth]}
    let values = Object.values(lastIds)
    let index = values.findIndex(i => i[0] == id)
    return values[index][1]
}

function getID(auth) { // lastIds = {"auth": [id, conn, auth]}
    let keys = Object.keys(lastIds)
    let index = keys.findIndex(i => i == auth)
    if (index != -1) {
        return lastIds[keys[index]][0]
    } else {
        return null
    }
}
 
function getOnlyInt(str) {
    return Number(str.replace(/[^+\d]/g, ''))
}
    
function stringToTime(string) {
    var coef = {
        "s": 1000,
        "min": 1000 * 60,
        "h": 1000 * 60 * 60,
        "d": 1000 * 60 * 60 * 24,
        "w": 1000 * 60 * 60 * 24 * 7,
        "mon": 1000 * 60 * 60 * 24 * 30,
    }
    for (var i of Object.keys(coef)) {
        if (string.includes(i)) {
            return getOnlyInt(string) * coef[i]
        }
    }
    return null
}
    
function getStringTime(str) {
    var rus = {
        "s": "сек",
        "min": "мин",
        "h": "ч",
        "d": "дн",
        "w": "нед",
        "mon": "мес",
    }
    for (var i of Object.keys(rus)) {
        if (str.includes(i)) {
            return `${getOnlyInt(str)}${rus[i]}`
        }
    }
    return null
}
    
function getStatTime(time) {
    return `${(time / 60).toFixed(2)}ч`
}
    
function getActTime() {
    subbed = new Date();
    hour = subbed.getHours().toString().length < 2 ? '0' + subbed.getHours() : subbed.getHours();
    min = subbed.getMinutes().toString().length < 2 ? '0' + subbed.getMinutes() : subbed.getMinutes();
    correct_date = `${hour}:${min}`;
    return correct_date
}
    
function getDate(mils) {
    subbed = new Date(mils);
    day = subbed.getDate().toString().length < 2 ? '0' + subbed.getDate() : subbed.getDate();
    mon = subbed.getMonth().toString().length < 2 ? '0' + (subbed.getMonth()+1) : (subbed.getMonth()+1);
    hour = subbed.getHours().toString().length < 2 ? '0' + subbed.getHours() : subbed.getHours();
    min = subbed.getMinutes().toString().length < 2 ? '0' + subbed.getMinutes() : subbed.getMinutes();
    correct_date = `${day}.${mon} ${hour}:${min}`;
    return correct_date
}
    
function findFirstNumberCharString(str) {
    let str_number = str[str.search(/[0-9]/g)];
    return str_number === undefined ? "0" : str_number;
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min) + min)
}

function getTeamArray(team) {
    players = room.getPlayerList();
    if (team == Team.RED) return players.filter((p) => p.team == Team.RED)
    else if (team == Team.BLUE) return players.filter((p) => p.team == Team.BLUE)
    else return players.filter((p) => p.team == 0).filter((p) => state.afkList.findIndex((i) => i[0] == p.id) == -1)
}

function getMinutesGame(time) {
    var t = Math.floor(time / 60);
    return `${Math.floor(t / 10)}${Math.floor(t % 10)}`;
}

function getSecondsGame(time) {
    var t = Math.floor(time - Math.floor(time / 60) * 60);
    return `${Math.floor(t / 10)}${Math.floor(t % 10)}`;
}

function getTimeGame(time) {
    return `[${getMinutesGame(time)}:${getSecondsGame(time)}]`;
}

function ballSpawner(training_mode_spawn) {
    state.ball_color = 0xffffff
    state.touches = 0
    if (training_mode_spawn[5] != undefined && (training_mode_spawn[5] == "serve_red" || training_mode_spawn[5] == "serve_blue") && room.getDiscProperties(0) != undefined) {
        disc = room.getDiscProperties(0)
        room.setDiscProperties(0, {
            cGroup: disc.cGroup | cf.kick,
        })
        state.serve = training_mode_spawn[5] == "serve_red" ? Team.RED : Team.BLUE
        state.serveBall = true
    }
    room.setDiscProperties(0, {
        x: training_mode_spawn[0],
        y: training_mode_spawn[1],
        xspeed: training_mode_spawn[2],
        yspeed: training_mode_spawn[3],
        color: state.ball_color
    })
}

return {
    getAuth,
    getConn,
    getID,
    getOnlyInt,
    stringToTime,
    getStringTime,
    getStatTime,
    getActTime,
    getDate,
    findFirstNumberCharString,
    getRandomInt,
    getTeamArray,
    getMinutesGame,
    getSecondsGame,
    getTimeGame,
    ballSpawner
}

};