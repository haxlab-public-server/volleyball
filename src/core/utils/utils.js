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
    return new Date().toLocaleTimeString("ru-RU", {
        timeZone: "Europe/Moscow",
        hour: "2-digit",
        minute: "2-digit"
    });
}
    
function getDate(mils) {
    const formatter = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    return formatter.format(new Date(mils)).replace(',', '');
}
    
function findFirstNumberCharString(str) {
    let str_number = str[str.search(/[0-9]/g)];
    return str_number === undefined ? "0" : str_number;
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min) + min)
}

function getRandomFloat(min, max) {
    if (min === max) return min;
    return Math.random() * (max - min) + min;
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

module.exports = {
    getOnlyInt,
    stringToTime,
    getStringTime,
    getStatTime,
    getActTime,
    getDate,
    findFirstNumberCharString,
    getRandomInt,
    getRandomFloat,
    getMinutesGame,
    getSecondsGame,
    getTimeGame,
}