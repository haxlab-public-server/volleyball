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

function sendVipPassword(vipWebhook, vipPassword) {
    if (vipWebhook != null && vipWebhook != "") {
        fetch(vipWebhook, {
            method: "POST",
            body: JSON.stringify({
                content: `# 🌟Новый VIP-Пароль: ${vipPassword}`,
                username: "vip",
            }),
            headers: {
                "Content-Type": "application/json",
            },
        }).then((res) => res);
    }
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
    getMinutesGame,
    getSecondsGame,
    getTimeGame,
    sendVipPassword
}