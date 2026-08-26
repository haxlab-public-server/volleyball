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

CREATE TABLE IF NOT EXISTS analytics_players (
    auth TEXT PRIMARY KEY,
    first_seen_at INTEGER NOT NULL,
    first_seen_day TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    last_seen_day TEXT NOT NULL,
    first_nick TEXT,
    last_nick TEXT,
    total_joins INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_sessions (
    session_id TEXT PRIMARY KEY,
    auth TEXT NOT NULL,
    room_type TEXT NOT NULL,
    room_category TEXT NOT NULL,
    nick_at_join TEXT,
    joined_at INTEGER NOT NULL,
    joined_day TEXT NOT NULL,
    left_at INTEGER,
    left_day TEXT,
    leave_reason TEXT,
    duration_sec INTEGER,
    FOREIGN KEY (auth) REFERENCES analytics_players(auth)
);

CREATE TABLE IF NOT EXISTS analytics_matches (
    match_id TEXT PRIMARY KEY,
    room_type TEXT NOT NULL,
    room_category TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    started_day TEXT NOT NULL,
    ended_at INTEGER,
    ended_day TEXT,
    players_start INTEGER,
    players_end INTEGER,
    winner_team INTEGER,
    end_reason TEXT,
    duration_sec INTEGER,
    is_full INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_events (
    event_id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    day_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    room_type TEXT NOT NULL,
    room_category TEXT NOT NULL,
    auth TEXT,
    session_id TEXT,
    match_id TEXT,
    payload_json TEXT
);

CREATE TABLE IF NOT EXISTS analytics_online_minute (
    minute_ts INTEGER NOT NULL,
    day_key TEXT NOT NULL,
    room_type TEXT NOT NULL,
    room_category TEXT NOT NULL,
    online_count INTEGER NOT NULL,
    PRIMARY KEY (minute_ts, room_type)
);

CREATE TABLE IF NOT EXISTS analytics_daily (
    day_key TEXT NOT NULL,
    room_category TEXT NOT NULL,
    joins_total INTEGER NOT NULL,
    joins_unique INTEGER NOT NULL,
    new_players INTEGER NOT NULL,
    returning_players INTEGER NOT NULL,
    avg_session_sec REAL NOT NULL,
    matches_total INTEGER NOT NULL,
    matches_full INTEGER NOT NULL,
    avg_match_sec REAL NOT NULL,
    online_peak INTEGER NOT NULL,
    online_avg REAL NOT NULL,
    generated_at INTEGER NOT NULL,
    PRIMARY KEY (day_key, room_category)
);

CREATE TABLE IF NOT EXISTS analytics_daily_reports_sent (
    day_key TEXT NOT NULL,
    room_category TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    PRIMARY KEY (day_key, room_category)
);

CREATE INDEX IF NOT EXISTS idx_analytics_players_first_seen_day ON analytics_players (first_seen_day);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_joined_day ON analytics_sessions (joined_day);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_left_day ON analytics_sessions (left_day);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_auth ON analytics_sessions (auth, joined_at);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_category_day ON analytics_sessions (room_category, joined_day);
CREATE INDEX IF NOT EXISTS idx_analytics_matches_started_day ON analytics_matches (started_day);
CREATE INDEX IF NOT EXISTS idx_analytics_matches_ended_day ON analytics_matches (ended_day);
CREATE INDEX IF NOT EXISTS idx_analytics_matches_category_day ON analytics_matches (room_category, ended_day);
CREATE INDEX IF NOT EXISTS idx_analytics_events_day_type ON analytics_events (day_key, event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_auth ON analytics_events (auth, ts);
CREATE INDEX IF NOT EXISTS idx_analytics_events_category_day ON analytics_events (room_category, day_key, event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_online_day ON analytics_online_minute (day_key, minute_ts);
CREATE INDEX IF NOT EXISTS idx_analytics_online_category_day ON analytics_online_minute (room_category, day_key, minute_ts);
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

    function analyticsTouchPlayer({ auth, nick, ts, dayKey }) {
        db.prepare(
            `INSERT INTO analytics_players (
                auth, first_seen_at, first_seen_day, last_seen_at, last_seen_day, first_nick, last_nick, total_joins
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(auth) DO UPDATE SET
                last_seen_at = excluded.last_seen_at,
                last_seen_day = excluded.last_seen_day,
                last_nick = excluded.last_nick,
                total_joins = analytics_players.total_joins + 1`
        ).run(auth, ts, dayKey, ts, dayKey, nick ?? null, nick ?? null);
    }

    function analyticsStartSession({ sessionId, auth, nick, joinedAt, dayKey, roomType, roomCategory }) {
        db.prepare(
            'INSERT OR IGNORE INTO analytics_sessions (session_id, auth, room_type, room_category, nick_at_join, joined_at, joined_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(sessionId, auth, roomType, roomCategory, nick ?? null, joinedAt, dayKey);
    }

    function analyticsEndSession({ sessionId, leftAt, dayKey, leaveReason }) {
        db.prepare(
            `UPDATE analytics_sessions
             SET left_at = ?,
                 left_day = ?,
                 leave_reason = ?,
                 duration_sec = CAST((? - joined_at) / 1000 AS INTEGER)
             WHERE session_id = ? AND left_at IS NULL`
        ).run(leftAt, dayKey, leaveReason ?? null, leftAt, sessionId);
    }

    function analyticsCloseDanglingSessions({ roomType, closedAt, dayKey }) {
        const dangling = db.prepare(
            'SELECT session_id FROM analytics_sessions WHERE room_type = ? AND left_at IS NULL'
        ).all(roomType);

        for (const row of dangling) {
            analyticsEndSession({
                sessionId: row.session_id,
                leftAt: closedAt,
                dayKey,
                leaveReason: 'process_restart'
            });
        }

        return dangling.length;
    }

    function analyticsStartMatch({ matchId, startedAt, dayKey, roomType, roomCategory, playersStart, isFull }) {
        db.prepare(
            'INSERT OR IGNORE INTO analytics_matches (match_id, room_type, room_category, started_at, started_day, players_start, is_full) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(matchId, roomType, roomCategory, startedAt, dayKey, playersStart ?? null, isFull ? 1 : 0);
    }

    function analyticsEndMatch({ matchId, endedAt, dayKey, playersEnd, winnerTeam, endReason }) {
        db.prepare(
            `UPDATE analytics_matches
             SET ended_at = ?,
                 ended_day = ?,
                 players_end = ?,
                 winner_team = ?,
                 end_reason = ?,
                 duration_sec = CAST((? - started_at) / 1000 AS INTEGER)
             WHERE match_id = ? AND ended_at IS NULL`
        ).run(endedAt, dayKey, playersEnd ?? null, winnerTeam ?? null, endReason ?? null, endedAt, matchId);
    }

    function analyticsAddEvent({ eventId, ts, dayKey, eventType, roomType, roomCategory, auth, sessionId, matchId, payloadJson }) {
        db.prepare(
            `INSERT OR IGNORE INTO analytics_events (
                event_id, ts, day_key, event_type, room_type, room_category, auth, session_id, match_id, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            eventId,
            ts,
            dayKey,
            eventType,
            roomType,
            roomCategory,
            auth ?? null,
            sessionId ?? null,
            matchId ?? null,
            payloadJson ?? null
        );
    }

    function analyticsUpsertOnlineMinute({ minuteTs, dayKey, roomType, roomCategory, onlineCount }) {
        db.prepare(
            `INSERT INTO analytics_online_minute (minute_ts, day_key, room_type, room_category, online_count)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(minute_ts, room_type) DO UPDATE SET
                day_key = excluded.day_key,
                online_count = excluded.online_count`
        ).run(minuteTs, dayKey, roomType, roomCategory, onlineCount);
    }

    function analyticsAggregateDaily(dayKey, roomCategory) {
        const joinsTotal = db.prepare(
            `SELECT COUNT(*) AS c
             FROM analytics_events
             WHERE event_type = 'player_join' AND day_key = ? AND room_category = ?`
        ).get(dayKey, roomCategory)?.c ?? 0;

        const joinsUnique = db.prepare(
            `SELECT COUNT(DISTINCT auth) AS c
             FROM analytics_events
             WHERE event_type = 'player_join' AND day_key = ? AND room_category = ? AND auth IS NOT NULL`
        ).get(dayKey, roomCategory)?.c ?? 0;

        const newPlayers = db.prepare(
            `SELECT COUNT(DISTINCT ae.auth) AS c
             FROM analytics_events ae
             JOIN analytics_players ap ON ap.auth = ae.auth
             WHERE ae.event_type = 'player_join' AND ae.day_key = ? AND ae.room_category = ?
               AND ap.first_seen_day = ?`
        ).get(dayKey, roomCategory, dayKey)?.c ?? 0;

        const avgSessionSec = db.prepare(
            'SELECT COALESCE(AVG(duration_sec), 0) AS v FROM analytics_sessions WHERE left_day = ? AND room_category = ? AND duration_sec IS NOT NULL'
        ).get(dayKey, roomCategory)?.v ?? 0;

        const matchesTotal = db.prepare(
            'SELECT COUNT(*) AS c FROM analytics_matches WHERE started_day = ? AND room_category = ?'
        ).get(dayKey, roomCategory)?.c ?? 0;

        const matchesFull = db.prepare(
            'SELECT COUNT(*) AS c FROM analytics_matches WHERE started_day = ? AND room_category = ? AND is_full = 1'
        ).get(dayKey, roomCategory)?.c ?? 0;

        const avgMatchSec = db.prepare(
            'SELECT COALESCE(AVG(duration_sec), 0) AS v FROM analytics_matches WHERE ended_day = ? AND room_category = ? AND duration_sec IS NOT NULL'
        ).get(dayKey, roomCategory)?.v ?? 0;

        const onlineStats = db.prepare(
            `SELECT
                COALESCE(MAX(total_online), 0) AS peak,
                COALESCE(AVG(total_online), 0) AS avg
             FROM (
                SELECT minute_ts, SUM(online_count) AS total_online
                FROM analytics_online_minute
                WHERE day_key = ? AND room_category = ?
                GROUP BY minute_ts
             )`
        ).get(dayKey, roomCategory) ?? { peak: 0, avg: 0 };

        const returningPlayers = Math.max(0, joinsUnique - newPlayers);

        db.prepare(
            `INSERT INTO analytics_daily (
                day_key,
                room_category,
                joins_total,
                joins_unique,
                new_players,
                returning_players,
                avg_session_sec,
                matches_total,
                matches_full,
                avg_match_sec,
                online_peak,
                online_avg,
                generated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(day_key, room_category) DO UPDATE SET
                joins_total = excluded.joins_total,
                joins_unique = excluded.joins_unique,
                new_players = excluded.new_players,
                returning_players = excluded.returning_players,
                avg_session_sec = excluded.avg_session_sec,
                matches_total = excluded.matches_total,
                matches_full = excluded.matches_full,
                avg_match_sec = excluded.avg_match_sec,
                online_peak = excluded.online_peak,
                online_avg = excluded.online_avg,
                generated_at = excluded.generated_at`
        ).run(
            dayKey,
            roomCategory,
            joinsTotal,
            joinsUnique,
            newPlayers,
            returningPlayers,
            avgSessionSec,
            matchesTotal,
            matchesFull,
            avgMatchSec,
            onlineStats.peak ?? 0,
            onlineStats.avg ?? 0,
            Date.now()
        );
    }

    function analyticsGetDaily(dayKey, roomCategory) {
        return db.prepare(
            `SELECT
                day_key AS dayKey,
                room_category AS roomCategory,
                joins_total AS joinsTotal,
                joins_unique AS joinsUnique,
                new_players AS newPlayers,
                returning_players AS returningPlayers,
                avg_session_sec AS avgSessionSec,
                matches_total AS matchesTotal,
                matches_full AS matchesFull,
                avg_match_sec AS avgMatchSec,
                online_peak AS onlinePeak,
                online_avg AS onlineAvg,
                generated_at AS generatedAt
             FROM analytics_daily
             WHERE day_key = ? AND room_category = ?`
        ).get(dayKey, roomCategory) ?? null;
    }

    function analyticsIsDailyReportSent(dayKey, roomCategory) {
        return db.prepare(
            'SELECT 1 FROM analytics_daily_reports_sent WHERE day_key = ? AND room_category = ?'
        ).get(dayKey, roomCategory) != null;
    }

    function analyticsMarkDailyReportSent(dayKey, roomCategory, sentAt = Date.now()) {
        db.prepare(
            `INSERT INTO analytics_daily_reports_sent (day_key, room_category, sent_at)
             VALUES (?, ?, ?)
             ON CONFLICT(day_key, room_category) DO UPDATE SET sent_at = excluded.sent_at`
        ).run(dayKey, roomCategory, sentAt);
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
        getMuteByAuth,
        analyticsTouchPlayer,
        analyticsStartSession,
        analyticsEndSession,
        analyticsCloseDanglingSessions,
        analyticsStartMatch,
        analyticsEndMatch,
        analyticsAddEvent,
        analyticsUpsertOnlineMinute,
        analyticsAggregateDaily,
        analyticsGetDaily,
        analyticsIsDailyReportSent,
        analyticsMarkDailyReportSent
    };
}

module.exports = { createDb };