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

function uint8ToBase64(bytes) {
    if (!bytes || typeof bytes !== 'object' || typeof bytes.length !== 'number') {
        return null;
    }

    let array;
    try {
        array = Array.from(bytes);
    } catch (e) {
        console.error('[uint8ToBase64] Array.from failed:', e);
        return null;
    }

    if (array.length === 0) return null;

    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < array.length; i += chunkSize) {
        const chunk = array.slice(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }

    return btoa(binary);
}

function fetchRecording(game, discord) {
    const rec = game.rec;

    if (!rec) {
        console.log('[fetchRecording] recording is null/undefined');
        return;
    }

    const base64 = uint8ToBase64(rec);
    if (!base64) {
        console.error('[fetchRecording] failed to convert to base64');
        return;
    }

    discord.sendRecording(base64, getRecordingName(), getIdReplay());
}

module.exports = {
    getRecordingName,
    getIdReplay,
    fetchRecording
};