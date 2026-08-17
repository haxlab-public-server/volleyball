/*
 * Parses a single spawner argument that is either a plain number ("120",
 * "-45.5") or a range "min..max" ("-450..-350"). Returns a small descriptor
 * object so the caller can resolve a (possibly random) value from it on
 * every spawn tick without re-parsing the string each time.
 */
function parseSpawnValue(raw) {
    const str = String(raw).trim();
    const rangeMatch = str.match(/^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/);

    if (rangeMatch) {
        const min = Number(rangeMatch[1]);
        const max = Number(rangeMatch[2]);
        if (isNaN(min) || isNaN(max)) return null;
        return { isRange: true, min: Math.min(min, max), max: Math.max(min, max) };
    }

    const num = Number(str);
    if (isNaN(num)) return null;
    return { isRange: false, value: num };
}

function parseSpawnSettings(args) {
    const parsed = args.slice(0, 4).map(parseSpawnValue);
    if (parsed.some((p) => p === null)) return null;
    return parsed;
}

function resolveSpawnValue(descriptor, getRandomFloat) {
    if (!descriptor.isRange) return descriptor.value;
    return getRandomFloat(descriptor.min, descriptor.max);
}

function formatSpawnValue(descriptor) {
    if (!descriptor.isRange) return String(descriptor.value);
    return `${descriptor.min}..${descriptor.max}`;
}

module.exports = {
    parseSpawnValue,
    parseSpawnSettings,
    resolveSpawnValue,
    formatSpawnValue
};