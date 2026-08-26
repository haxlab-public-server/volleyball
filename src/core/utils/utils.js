function getOnlyInt(str) {
    return Number(str.replace(/[^+\d]/g, ''))
}

const MS_PER_TIME_UNIT = {
    s: 1000,
    min: 1000 * 60,
    h: 1000 * 60 * 60,
    d: 1000 * 60 * 60 * 24,
    w: 1000 * 60 * 60 * 24 * 7,
    mon: 1000 * 60 * 60 * 24 * 30
};

function parseDuration(input) {
    const value = String(input);
    const match = value.match(/^\+?(\d+)(mon|min|s|h|d|w)$/);
    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isSafeInteger(amount) || amount <= 0) return null;

    return { amount, unit, ms: amount * MS_PER_TIME_UNIT[unit] };
}

function getStatTime(time) {
    return `${(time / 60).toFixed(2)}ч`
}
    
function getDate(mils, timeFormat) {
    if (timeFormat && typeof timeFormat.formatDateShort === 'function') {
        return timeFormat.formatDateShort(mils);
    }
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

function formatTimePart(value) {
    return String(Math.floor(value)).padStart(2, '0');
}

function getMinutesGame(time) {
    return formatTimePart(time / 60);
}

function getSecondsGame(time) {
    const minutes = Math.floor(time / 60);
    return formatTimePart(time - minutes * 60);
}

function getTimeGame(time) {
    return `[${getMinutesGame(time)}:${getSecondsGame(time)}]`;
}

module.exports = {
    getOnlyInt,
    parseDuration,
    getStatTime,
    getDate,
    findFirstNumberCharString,
    getRandomInt,
    getRandomFloat,
    getMinutesGame,
    getSecondsGame,
    getTimeGame,
}