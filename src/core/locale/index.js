/*
 * Localization entry point. The only place any other module should get
 * player-facing text from (in the HaxBall room or in Discord).
 *
 * Usage (both in the browser context — src/browser/entry.js — and in
 * the Node context — src/index.js / discordBot.js / discordCommands.js):
 *
 *   const { createLocale } = require('.../core/locale');
 *   const { t, stringToTime, getStringTime } = createLocale(localeCode);
 *
 *   room.sendAnnouncement(t('ban.success', { admin, target, time, reason }), ...);
 *
 * To add a new language: do NOT edit ru.js or en.js in place. Copy one
 * of them to locale/<code>.js, translate only the string values (keep
 * every key path identical), register the file in dicts below, and
 * point LOCALE=<code> at it via .env. Every other module
 * keeps calling the same t(key, params) — nothing outside this folder
 * needs to change to switch or add a language.
 */

const ru = require('./ru');
const en = require('./en');
const { parseDuration } = require('../utils/utils');

const dicts = {
    ru,
    en
};

const DEFAULT_LOCALE = 'ru';

function resolve(dict, key) {
    return key.split('.').reduce((node, part) => (node == null ? node : node[part]), dict);
}

function interpolate(str, params) {
    return str.replace(/\{(\w+)\}/g, (match, name) => {
        if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
        const value = params[name];
        return value == null ? '' : String(value);
    });
}

/*
 * localeCode: e.g. 'ru' | 'en'. Falls back to DEFAULT_LOCALE if the code
 * is unknown, and further falls back key-by-key to DEFAULT_LOCALE's
 * dictionary if a translation is missing in the chosen locale (so a
 * partially-translated locale file doesn't produce blank/undefined text
 * in the room — it just shows the default-locale string for whatever
 * hasn't been translated yet).
 */
function createLocale(localeCode = DEFAULT_LOCALE) {
    const dict = dicts[localeCode] ?? dicts[DEFAULT_LOCALE];
    const fallbackDict = dicts[DEFAULT_LOCALE];

    function t(key, params = {}) {
        let template = resolve(dict, key);

        if (template == null && dict !== fallbackDict) {
            template = resolve(fallbackDict, key);
        }

        if (template == null) {
            console.warn(`[locale] missing key: "${key}" (locale: ${localeCode})`);
            return key;
        }

        if (typeof template !== 'string') {
            console.warn(`[locale] key "${key}" does not resolve to a string (locale: ${localeCode})`);
            return key;
        }

        return interpolate(template, params);
    }

    function stringToTime(input) {
        return parseDuration(input)?.ms ?? null;
    }

    function getStringTime(input) {
        const units = dict.time?.units ?? fallbackDict.time.units;
        const parsed = parseDuration(input);
        return parsed ? `${parsed.amount}${units[parsed.unit]}` : null;
    }

    return {
        localeCode: dicts[localeCode] ? localeCode : DEFAULT_LOCALE,
        t,
        stringToTime,
        getStringTime
    };
}

module.exports = {
    createLocale,
    DEFAULT_LOCALE
};