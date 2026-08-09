const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
    auth TEXT PRIMARY KEY,
    nickname TEXT,
    role TEXT,
    date INTEGER,
    discord TEXT,
    chat_color TEXT
);
CREATE TABLE IF NOT EXISTS bans (
    ban_id INTEGER,
    auth TEXT,
    conn TEXT,
    name TEXT,
    date INTEGER
);
CREATE TABLE IF NOT EXISTS mutes (
    mute_id INTEGER,
    name TEXT,
    player_id INTEGER,
    auth TEXT,
    unmute_date INTEGER
);
CREATE TABLE IF NOT EXISTS nicknames (
    auth TEXT,
    name TEXT
);
CREATE TABLE IF NOT EXISTS auths (
    auth TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS stats (
    auth TEXT PRIMARY KEY,
    name TEXT,
    games INTEGER,
    wins INTEGER,
    goals INTEGER,
    blocks INTEGER,
    assists INTEGER,
    blocked_attacks INTEGER,
    errors INTEGER,
    aces INTEGER,
    serves INTEGER,
    play_time INTEGER
);
`;

function createDb(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(SCHEMA);

    function inTransaction(fn) {
        db.exec('BEGIN');
        try {
            fn();
            db.exec('COMMIT');
        } catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }
    }

    function readAccounts() {
        const rows = db.prepare('SELECT auth, nickname, role, date, discord, chat_color FROM accounts ORDER BY rowid').all();
        const result = {};
        for (const row of rows) {
            result[row.auth] = {
                nickname: row.nickname,
                role: row.role,
                date: row.date,
                discord: row.discord,
                chat_color: row.chat_color
            };
        }
        return result;
    }

    function writeAccounts(data) {
        inTransaction(() => {
            db.exec('DELETE FROM accounts');
            const insert = db.prepare('INSERT INTO accounts (auth, nickname, role, date, discord, chat_color) VALUES (?, ?, ?, ?, ?, ?)');
            for (const auth of Object.keys(data)) {
                const acc = data[auth];
                insert.run(auth, acc.nickname ?? null, acc.role ?? null, acc.date ?? null, acc.discord ?? null, acc.chat_color ?? null);
            }
        });
    }

    function readBans() {
        return db.prepare('SELECT ban_id AS id, auth, conn, name, date FROM bans ORDER BY rowid').all();
    }

    function writeBans(list) {
        inTransaction(() => {
            db.exec('DELETE FROM bans');
            const insert = db.prepare('INSERT INTO bans (ban_id, auth, conn, name, date) VALUES (?, ?, ?, ?, ?)');
            for (const ban of list) {
                insert.run(ban.id ?? null, ban.auth ?? null, ban.conn ?? null, ban.name ?? null, ban.date ?? null);
            }
        });
    }

    function readMutes() {
        return db.prepare('SELECT mute_id AS id, name, player_id AS playerId, auth, unmute_date AS unmuteDate FROM mutes ORDER BY rowid').all();
    }

    function writeMutes(list) {
        inTransaction(() => {
            db.exec('DELETE FROM mutes');
            const insert = db.prepare('INSERT INTO mutes (mute_id, name, player_id, auth, unmute_date) VALUES (?, ?, ?, ?, ?)');
            for (const mute of list) {
                insert.run(mute.id ?? null, mute.name ?? null, mute.playerId ?? null, mute.auth ?? null, mute.unmuteDate ?? null);
            }
        });
    }

    function readNicknames() {
        const rows = db.prepare('SELECT auth, name FROM nicknames ORDER BY rowid').all();
        const result = {};
        for (const row of rows) {
            if (!result[row.auth]) result[row.auth] = [];
            result[row.auth].push(row.name);
        }
        return result;
    }

    function writeNicknames(data) {
        inTransaction(() => {
            db.exec('DELETE FROM nicknames');
            const insert = db.prepare('INSERT INTO nicknames (auth, name) VALUES (?, ?)');
            for (const auth of Object.keys(data)) {
                for (const name of data[auth]) {
                    insert.run(auth, name);
                }
            }
        });
    }

    function readAuths() {
        return db.prepare('SELECT auth FROM auths ORDER BY rowid').all().map(row => row.auth);
    }

    function writeAuths(list) {
        inTransaction(() => {
            db.exec('DELETE FROM auths');
            const insert = db.prepare('INSERT INTO auths (auth) VALUES (?)');
            for (const auth of list) {
                insert.run(auth);
            }
        });
    }

    function readStats() {
        const rows = db.prepare('SELECT auth, name, games, wins, goals, blocks, assists, blocked_attacks, errors, aces, serves, play_time FROM stats ORDER BY rowid').all();
        const result = {};
        for (const row of rows) {
            result[row.auth] = [
                row.name, row.games, row.wins, row.goals, row.blocks,
                row.assists, row.blocked_attacks, row.errors, row.aces,
                row.serves, row.play_time
            ];
        }
        return result;
    }

    function writeStats(data) {
        inTransaction(() => {
            db.exec('DELETE FROM stats');
            const insert = db.prepare('INSERT INTO stats (auth, name, games, wins, goals, blocks, assists, blocked_attacks, errors, aces, serves, play_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            for (const auth of Object.keys(data)) {
                const s = data[auth];
                insert.run(auth, s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9], s[10]);
            }
        });
    }

    const READERS = {
        'accounts.json': readAccounts,
        'bans.json': readBans,
        'mutes.json': readMutes,
        'nicknames.json': readNicknames,
        'auths.json': readAuths,
        'stats.json': readStats
    };

    const WRITERS = {
        'accounts.json': writeAccounts,
        'bans.json': writeBans,
        'mutes.json': writeMutes,
        'nicknames.json': writeNicknames,
        'auths.json': writeAuths,
        'stats.json': writeStats
    };

    function exists(filename) {
        return Object.prototype.hasOwnProperty.call(READERS, filename);
    }

    function readFile(filename) {
        const reader = READERS[filename];
        if (!reader) return null;
        return JSON.stringify(reader());
    }

    function writeFile(filename, jsonString) {
        const writer = WRITERS[filename];
        if (!writer) return;
        writer(JSON.parse(jsonString));
    }

    function addMaster(auth) {
        const row = db.prepare('SELECT auth, nickname, role, date, discord, chat_color FROM accounts WHERE auth = ?').get(auth);
        if (!row) return false;
        db.prepare('UPDATE accounts SET role = ? WHERE auth = ?').run('master', auth);
        return true;
    }

    function snapshot() {
        const result = {};
        for (const filename of Object.keys(READERS)) {
            result[filename] = readFile(filename);
        }
        return result;
    }

    function close() {
        db.close();
    }

    return { addMaster, exists, readFile, writeFile, snapshot, close };
}

module.exports = { createDb };
