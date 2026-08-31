function createTimeFormat(timeZone) {
    const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const displayFormatter = new Intl.DateTimeFormat('ru-RU', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const dateOnlyFormatter = new Intl.DateTimeFormat('ru-RU', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    const hourFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        hour12: false
    });

    const partsFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const localPartsFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    function getDayKey(ts = Date.now()) {
        const parts = dayKeyFormatter.formatToParts(new Date(ts));
        const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
        return `${byType.year}-${byType.month}-${byType.day}`;
    }

    function formatDate(d = new Date()) {
        return displayFormatter.format(d).replace(', ', ' ');
    }

    function formatDateShort(mils) {
        return dateOnlyFormatter.format(new Date(mils)).replace(',', '');
    }

    function getHour(ts = Date.now()) {
        return Number(hourFormatter.format(new Date(ts)));
    }

    function getParts(d = new Date()) {
        const parts = {};
        for (const part of partsFormatter.formatToParts(d)) {
            if (part.type !== 'literal') parts[part.type] = part.value;
        }
        return parts;
    }

    function dayKeyToLocalMidnightTs(dayKey) {
        const [year, month, day] = dayKey.split('-').map(Number);
        const guess = Date.UTC(year, month - 1, day);

        const localParts = localPartsFormatter.formatToParts(new Date(guess));
        const byType = Object.fromEntries(localParts.map((p) => [p.type, p.value]));
        const localAsUtc = Date.UTC(
            Number(byType.year), Number(byType.month) - 1, Number(byType.day),
            Number(byType.hour), Number(byType.minute), Number(byType.second)
        );

        const offset = localAsUtc - guess;
        return guess - offset;
    }

    return {
        timeZone,
        getDayKey,
        formatDate,
        formatDateShort,
        getHour,
        getParts,
        dayKeyToLocalMidnightTs
    };
}

module.exports = { createTimeFormat };