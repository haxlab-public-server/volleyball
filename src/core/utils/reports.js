const {
    findFirstNumberCharString
} = require('./utils')

function getMoscowParts(d = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = {};
    for (const part of formatter.formatToParts(d)) {
        if (part.type !== 'literal') parts[part.type] = part.value;
    }
    return parts;
}

function getRecordingName() {
    const p = getMoscowParts();
    const year = p.year.slice(2);
    return `${p.day}-${p.month}-${year}-${p.hour}h${p.minute}.hbr2`;
}

function getIdReplay() {
    const p = getMoscowParts();
    return `${p.year.slice(2)}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}

function fetchRecording(game, discord) {
    discord.sendRecording(game.rec, getRecordingName(), getIdReplay())
}

module.exports = {
    getRecordingName,
    getIdReplay,
    fetchRecording
};