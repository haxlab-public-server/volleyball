/*
 * Checks dependency objects passed from the browser entrypoint to factories.
 * Usage: node tools/check-dependencies.js
 */
const fs = require('node:fs');
const path = require('node:path');

const entryPath = path.join(__dirname, '..', 'src', 'browser', 'entry.js');
const entrySource = fs.readFileSync(entryPath, 'utf8');

const factories = {
    createModels: 'src/core/models/models.js',
    createRoomUtils: 'src/core/utils/roomUtils.js',
    createSitState: 'src/core/services/sitState.js',
    createRoleHelpers: 'src/core/utils/roles.js',
    createAccountsHelpers: 'src/core/services/accounts.js',
    createCaptainsHelpers: 'src/core/services/captains.js',
    createUpdatesUtils: 'src/core/services/updates.js',
    createTrainingService: 'src/core/services/training.js',
    createIntervals: 'src/core/services/intervals.js',
    createChatHelpers: 'src/core/services/chat.js',
    createPlayerCommands: 'src/core/commands/player.js',
    createVipCommands: 'src/core/commands/vip.js',
    createAdminCommands: 'src/core/commands/admin.js',
    createMasterCommands: 'src/core/commands/master.js',
    createCommands: 'src/core/commands/commands.js',
    createMovementEvents: 'src/core/events/movement.js',
    createActivityEvents: 'src/core/events/activity.js',
    createGameEvents: 'src/core/events/game.js',
    createMiscEvents: 'src/core/events/misc.js'
};

function readBalanced(source, start) {
    const open = source.indexOf('{', start);
    if (open === -1) return null;

    let depth = 0;
    let quote = null;
    let comment = null;

    for (let index = open; index < source.length; index++) {
        const char = source[index];
        const next = source[index + 1];

        if (comment === 'line') {
            if (char === '\n') comment = null;
            continue;
        }
        if (comment === 'block') {
            if (char === '*' && next === '/') {
                comment = null;
                index++;
            }
            continue;
        }
        if (quote) {
            if (char === '\\') index++;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === '/' && next === '/') {
            comment = 'line';
            index++;
            continue;
        }
        if (char === '/' && next === '*') {
            comment = 'block';
            index++;
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            quote = char;
            continue;
        }
        if (char === '{') depth++;
        if (char === '}' && --depth === 0) {
            return source.slice(open + 1, index);
        }
    }

    return null;
}

function propertyNames(objectSource) {
    const names = [];
    for (const line of objectSource.split('\n')) {
        const cleanLine = line.replace(/\/\/.*$/, '').trim();
        const match = cleanLine.match(/^([A-Za-z_$][\w$]*)\s*(?::|,|$)/);
        if (match) names.push(match[1]);
    }
    return names;
}

function signatureParameters(filePath) {
    const source = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
    const functionStart = source.indexOf('module.exports = function');
    const parametersStart = source.indexOf('{', functionStart);
    const parameters = readBalanced(source.slice(parametersStart), 0);
    if (parameters == null) throw new Error(`Cannot read signature: ${filePath}`);
    return parameters.split(',').map(value => value.trim()).filter(Boolean)
        .map(value => value.match(/^([A-Za-z_$][\w$]*)/)?.[1])
        .filter(Boolean);
}

function checkFactory(factory, filePath) {
    const callStart = entrySource.indexOf(`${factory}({`);
    if (callStart === -1) return [`${factory}: call not found in entry.js`];

    const objectSource = readBalanced(entrySource, callStart);
    if (objectSource == null) return [`${factory}: dependency object is not closed`];

    const passed = propertyNames(objectSource);
    const expected = signatureParameters(filePath);
    const errors = [];
    const duplicates = passed.filter((name, index) => passed.indexOf(name) !== index);
    const extra = passed.filter(name => !expected.includes(name));
    const missing = expected.filter(name => !passed.includes(name));

    if (duplicates.length) errors.push(`duplicate: ${[...new Set(duplicates)].join(', ')}`);
    if (extra.length) errors.push(`extra: ${extra.join(', ')}`);
    if (missing.length) errors.push(`missing: ${missing.join(', ')}`);
    return errors.map(error => `${factory}: ${error}`);
}

const errors = Object.entries(factories).flatMap(([factory, filePath]) =>
    checkFactory(factory, filePath)
);

if (errors.length) {
    console.error('Dependency wiring check failed:');
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
}

console.log(`Dependency wiring OK: ${Object.keys(factories).length} factories checked.`);
