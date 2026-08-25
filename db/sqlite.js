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
CREATE INDEX IF NOT EXISTS idx_bans_auth ON bans (auth);
CREATE INDEX IF NOT EXISTS idx_bans_conn ON bans (conn);
CREATE INDEX IF NOT EXISTS idx_mutes_auth ON mutes (auth);
CREATE INDEX IF NOT EXISTS idx_accounts_discord ON accounts (discord);
CREATE INDEX IF NOT EXISTS idx_stats_name ON stats (name);
`;

const STAT_FIELDS = [
    null,
    'games',
    'wins',
    'goals',
    'blocks',
    'assists',
    'blocked_attacks',
    'errors',
    'aces',
    'serves',
    'play_time'
];

function createDb(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(SCHEMA);

    const backupsDir = dbPath === ':memory:'
        ? path.join(__dirname, 'backups')
        : path.join(path.dirname(dbPath), 'backups');

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

    function getBans() {
        return db.prepare('SELECT ban_id AS id, auth, conn, name, date FROM bans ORDER BY rowid').all();
    }

    function addBan(ban) {
        db.prepare('INSERT INTO bans (ban_id, auth, conn, name, date) VALUES (?, ?, ?, ?, ?)').run(
            ban.id ?? null,
            ban.auth ?? null,
            ban.conn ?? null,
            ban.name ?? null,
            ban.date ?? null
        );
    }

    function removeBanByIndex(index) {
        const rows = db.prepare('SELECT rowid FROM bans ORDER BY rowid').all();
        if (index < 0 || index >= rows.length) return null;
        const rowid = rows[index].rowid;
        const ban = db.prepare('SELECT ban_id AS id, auth, conn, name, date FROM bans WHERE rowid = ?').get(rowid);
        db.prepare('DELETE FROM bans WHERE rowid = ?').run(rowid);
        return ban;
    }

    function removeBanByAuth(auth) {
        const ban = db.prepare('SELECT ban_id AS id, auth, conn, name, date FROM bans WHERE auth = ? ORDER BY rowid LIMIT 1').get(auth);
        if (!ban) return null;
        db.prepare('DELETE FROM bans WHERE rowid = (SELECT rowid FROM bans WHERE auth = ? ORDER BY rowid LIMIT 1)').run(auth);
        return ban;
    }

    function findBan(auth, conn) {
        return db.prepare(
            'SELECT rowid, ban_id AS id, auth, conn, name, date FROM bans WHERE auth = ? OR conn = ? ORDER BY rowid LIMIT 1'
        ).get(auth, conn);
    }

    function updateBan(rowid, ban) {
        db.prepare(
            'UPDATE bans SET ban_id = ?, auth = ?, conn = ?, name = ? WHERE rowid = ?'
        ).run(ban.id ?? null, ban.auth ?? null, ban.conn ?? null, ban.name ?? null, rowid);
    }

    function getExpiredBans(now = Date.now()) {
        return db.prepare(
            'SELECT ban_id AS id, auth, conn, name, date FROM bans WHERE date < ?'
        ).all(now);
    }

    function removeExpiredBans(now = Date.now()) {
        db.prepare('DELETE FROM bans WHERE date < ?').run(now);
    }

    function hasAuth(auth) {
        return db.prepare('SELECT 1 FROM auths WHERE auth = ?').get(auth) != null;
    }

    function addAuth(auth) {
        if (hasAuth(auth)) return false;
        db.prepare('INSERT INTO auths (auth) VALUES (?)').run(auth);
        return true;
    }

    function removeAuth(auth) {
        const info = db.prepare('DELETE FROM auths WHERE auth = ?').run(auth);
        return info.changes > 0;
    }

    function clearAuths() {
        db.exec('DELETE FROM auths');
    }

    function getAccount(auth) {
        const row = db.prepare('SELECT auth, nickname, role, date, discord, chat_color FROM accounts WHERE auth = ?').get(auth);
        if (!row) return null;
        return {
            nickname: row.nickname,
            role: row.role,
            date: row.date,
            discord: row.discord,
            chat_color: row.chat_color
        };
    }

    function hasAccount(auth) {
        return db.prepare('SELECT 1 FROM accounts WHERE auth = ?').get(auth) != null;
    }

    function getAccountsByRole(role) {
        return db.prepare('SELECT auth, nickname, role, date, discord, chat_color FROM accounts WHERE role = ? ORDER BY rowid').all(role);
    }

    function ensureAccount(auth, nickname) {
        const existing = db.prepare('SELECT 1 FROM accounts WHERE auth = ?').get(auth);
        if (existing) {
            db.prepare('UPDATE accounts SET nickname = ? WHERE auth = ?').run(nickname, auth);
        } else {
            db.prepare('INSERT INTO accounts (auth, nickname, role, date, discord, chat_color) VALUES (?, ?, ?, ?, ?, ?)').run(
                auth, nickname, 'player', null, null, null
            );
        }
    }

    function setRole(auth, role, date) {
        db.prepare('UPDATE accounts SET role = ?, date = ? WHERE auth = ?').run(role, date ?? null, auth);
    }

    function setChatColor(auth, color) {
        const info = db.prepare('UPDATE accounts SET chat_color = ? WHERE auth = ?').run(color, auth);
        return info.changes > 0;
    }

    function setDiscordId(auth, discordId) {
        const info = db.prepare('UPDATE accounts SET discord = ? WHERE auth = ?').run(discordId, auth);
        return info.changes > 0;
    }

    function getAccountByDiscordId(discordId) {
        const row = db.prepare(
            'SELECT auth, nickname, role, date, discord, chat_color FROM accounts WHERE discord = ?'
        ).get(discordId);
        if (!row) return null;
        return {
            auth: row.auth,
            nickname: row.nickname,
            role: row.role,
            date: row.date,
            discord: row.discord,
            chat_color: row.chat_color
        };
    }

    function expireRoles(now = Date.now()) {
        const expired = db.prepare(
            'SELECT auth FROM accounts WHERE date IS NOT NULL AND date <= ?'
        ).all(now);
        if (expired.length > 0) {
            db.prepare(
                'UPDATE accounts SET role = ?, date = NULL WHERE date IS NOT NULL AND date <= ?'
            ).run('player', now);
        }
        return expired.map(r => r.auth);
    }

    function addMaster(auth) {
        const row = db.prepare('SELECT auth FROM accounts WHERE auth = ?').get(auth);
        if (!row) return false;
        db.prepare('UPDATE accounts SET role = ? WHERE auth = ?').run('master', auth);
        return true;
    }

    function getStat(auth) {
        const row = db.prepare('SELECT name, games, wins, goals, blocks, assists, blocked_attacks, errors, aces, serves, play_time FROM stats WHERE auth = ?').get(auth);
        if (!row) return null;
        return [
            row.name, row.games, row.wins, row.goals, row.blocks,
            row.assists, row.blocked_attacks, row.errors, row.aces,
            row.serves, row.play_time
        ];
    }

    function getAllStats() {
        return db.prepare(
            'SELECT auth, name, games, wins, goals, blocks, assists, blocked_attacks, errors, aces, serves, play_time FROM stats ORDER BY rowid'
        ).all();
    }

    function setStatName(auth, name) {
        const info = db.prepare('UPDATE stats SET name = ? WHERE auth = ?').run(name, auth);
        return info.changes > 0;
    }

    function findStatsByName(pname) {
        const rows = db.prepare('SELECT auth, name, games, wins, goals, blocks, assists, blocked_attacks, errors, aces, serves, play_time FROM stats').all();
        return rows
            .filter(r => r.name != null && r.name.toLowerCase().replace(/_/g, ' ') === pname)
            .map(r => [
                r.auth,
                [
                    r.name, r.games, r.wins, r.goals, r.blocks,
                    r.assists, r.blocked_attacks, r.errors, r.aces,
                    r.serves, r.play_time
                ]
            ]);
    }

    function getTopStats(minGames = 5) {
        return db.prepare(
            'SELECT name, games, wins, goals, blocks, assists, blocked_attacks, errors, aces, serves, play_time FROM stats WHERE games >= ?'
        ).all(minGames).map(r => [
            r.name, r.games, r.wins, r.goals, r.blocks,
            r.assists, r.blocked_attacks, r.errors, r.aces,
            r.serves, r.play_time
        ]);
    }

    function ensureStat(auth, name) {
        const exists = db.prepare('SELECT 1 FROM stats WHERE auth = ?').get(auth);
        if (!exists) {
            db.prepare(
                'INSERT INTO stats (auth, name, games, wins, goals, blocks, assists, blocked_attacks, errors, aces, serves, play_time) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)'
            ).run(auth, name);
        }
    }

    function incrementStat(auth, index) {
        const field = STAT_FIELDS[index];
        if (!field) return false;
        const info = db.prepare(`UPDATE stats SET ${field} = ${field} + 1 WHERE auth = ?`).run(auth);
        return info.changes > 0;
    }

    function clearStats() {
        db.exec('DELETE FROM stats');
    }

    /*
     * Dumps the full stats table to a timestamped JSON file under
     * db/backups/ and returns { filename, filePath, count } so the caller
     * (e.g. the !statsclear command) can also forward the file elsewhere
     * (Discord log channel, etc). Safe to call even if stats is empty.
     */
    function backupStats() {
        const rows = getAllStats();

        fs.mkdirSync(backupsDir, { recursive: true });

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const filename = `stats-backup-${stamp}.json`;
        const filePath = path.join(backupsDir, filename);

        fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8');

        return { filename, filePath, count: rows.length };
    }

    function backupAndClearStats() {
        const backup = backupStats();
        try {
            inTransaction(clearStats);
            return backup;
        } catch (error) {
            try {
                fs.unlinkSync(backup.filePath);
            } catch {}
            throw error;
        }
    }

    function getNicknames(auth) {
        return db.prepare('SELECT name FROM nicknames WHERE auth = ? ORDER BY rowid').all(auth).map(r => r.name);
    }

    function hasNicknames(auth) {
        return db.prepare('SELECT 1 FROM nicknames WHERE auth = ? LIMIT 1').get(auth) != null;
    }

    function addNickname(auth, name) {
        const exists = db.prepare('SELECT 1 FROM nicknames WHERE auth = ? AND name = ?').get(auth, name);
        if (!exists) {
            db.prepare('INSERT INTO nicknames (auth, name) VALUES (?, ?)').run(auth, name);
        }
    }

    function getMutes() {
        return db.prepare(
            'SELECT mute_id AS id, name, player_id AS playerId, auth, unmute_date AS unmuteDate FROM mutes ORDER BY rowid'
        ).all();
    }

    function addMute(mute) {
        db.prepare(
            'INSERT INTO mutes (mute_id, name, player_id, auth, unmute_date) VALUES (?, ?, ?, ?, ?)'
        ).run(
            mute.id ?? null,
            mute.name ?? null,
            mute.playerId ?? null,
            mute.auth ?? null,
            mute.unmuteDate ?? null
        );
    }

    function removeMuteById(id) {
        const info = db.prepare('DELETE FROM mutes WHERE mute_id = ?').run(id);
        return info.changes > 0;
    }

    function removeMuteByAuth(auth) {
        const info = db.prepare('DELETE FROM mutes WHERE auth = ?').run(auth);
        return info.changes > 0;
    }

    function getMuteById(id) {
        return db.prepare(
            'SELECT mute_id AS id, name, player_id AS playerId, auth, unmute_date AS unmuteDate FROM mutes WHERE mute_id = ?'
        ).get(id) ?? null;
    }

    function getMuteByPlayerId(playerId) {
        return db.prepare(
            'SELECT mute_id AS id, name, player_id AS playerId, auth, unmute_date AS unmuteDate FROM mutes WHERE player_id = ?'
        ).get(playerId) ?? null;
    }

    function getMuteByAuth(auth) {
        return db.prepare(
            'SELECT mute_id AS id, name, player_id AS playerId, auth, unmute_date AS unmuteDate FROM mutes WHERE auth = ?'
        ).get(auth) ?? null;
    }

    function close() {
        db.close();
    }

    return {
        close,
        getBans,
        addBan,
        removeBanByIndex,
        removeBanByAuth,
        findBan,
        updateBan,
        getExpiredBans,
        removeExpiredBans,
        hasAuth,
        addAuth,
        removeAuth,
        clearAuths,
        getAccount,
        hasAccount,
        getAccountsByRole,
        ensureAccount,
        setRole,
        setChatColor,
        setDiscordId,
        getAccountByDiscordId,
        expireRoles,
        addMaster,
        getStat,
        getAllStats,
        setStatName,
        findStatsByName,
        getTopStats,
        ensureStat,
        incrementStat,
        clearStats,
        backupStats,
        backupAndClearStats,
        getNicknames,
        hasNicknames,
        addNickname,
        getMutes,
        addMute,
        removeMuteById,
        removeMuteByAuth,
        getMuteById,
        getMuteByPlayerId,
        getMuteByAuth
    };
}

module.exports = { createDb };