module.exports = function createAnalyticsService({
    room,
    state,
    db,
    roomLabel,
    roomCategory,
    Team,
    timeFormat
}) {
    const { getDayKey } = timeFormat;

    const roomType = String(roomLabel || 'unknown').toLowerCase();

    function minuteBucket(ts = Date.now()) {
        return Math.floor(ts / 60000) * 60000;
    }

    function safeRandomId(prefix) {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `${prefix}_${crypto.randomUUID()}`;
        }

        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    if (!state.analytics) {
        state.analytics = {
            sessionsByAuth: {},
            currentMatchId: null
        };
    }

    function closeDanglingSessionsOnStartup() {
        const now = Date.now();
        const closed = db.analyticsCloseDanglingSessions({
            roomType,
            closedAt: now,
            dayKey: getDayKey(now)
        });
        if (closed > 0) {
            console.log(`[Analytics] Closed ${closed} dangling session(s) from a previous run for room "${roomType}".`);
        }
    }
    closeDanglingSessionsOnStartup();

    async function trackEvent({ eventType, auth = null, sessionId = null, matchId = null, payload = null, ts = Date.now() }) {
        await db.analyticsAddEvent({
            eventId: safeRandomId('evt'),
            ts,
            dayKey: getDayKey(ts),
            eventType,
            roomType,
            roomCategory,
            auth,
            sessionId,
            matchId,
            payloadJson: payload == null ? null : JSON.stringify(payload)
        });
    }

    async function onPlayerJoin(player) {
        const ts = Date.now();
        const dayKey = getDayKey(ts);
        const sessionId = safeRandomId('sess');

        await db.analyticsTouchPlayer({
            auth: player.auth,
            nick: player.name,
            ts,
            dayKey
        });

        await db.analyticsStartSession({
            sessionId,
            auth: player.auth,
            nick: player.name,
            joinedAt: ts,
            dayKey,
            roomType,
            roomCategory
        });

        state.analytics.sessionsByAuth[player.auth] = sessionId;

        await trackEvent({
            eventType: 'player_join',
            auth: player.auth,
            sessionId,
            ts,
            payload: { nick: player.name }
        });
    }

    async function onPlayerLeave(player, reason = 'leave') {
        const ts = Date.now();
        const dayKey = getDayKey(ts);
        const sessionId = state.analytics.sessionsByAuth[player.auth] ?? null;

        if (sessionId != null) {
            await db.analyticsEndSession({
                sessionId,
                leftAt: ts,
                dayKey,
                leaveReason: reason
            });
            delete state.analytics.sessionsByAuth[player.auth];
        }

        await trackEvent({
            eventType: 'player_leave',
            auth: player.auth,
            sessionId,
            ts,
            payload: { nick: player.name, reason }
        });
    }

    async function onGameStart(isFull = false) {
        const ts = Date.now();
        const dayKey = getDayKey(ts);
        const matchId = safeRandomId('match');
        const playersStart = room.getPlayerList().filter((p) => p.team !== Team.SPECTATORS).length;

        await db.analyticsStartMatch({
            matchId,
            startedAt: ts,
            dayKey,
            roomType,
            roomCategory,
            playersStart,
            isFull
        });

        state.analytics.currentMatchId = matchId;

        await trackEvent({
            eventType: 'match_start',
            matchId,
            ts,
            payload: { playersStart, isFull }
        });
    }

    async function onGameStop({ byPlayer, scores }) {
        const matchId = state.analytics.currentMatchId;
        if (!matchId) return;

        const ts = Date.now();
        const dayKey = getDayKey(ts);
        const playersEnd = room.getPlayerList().filter((p) => p.team !== Team.SPECTATORS).length;
        const endReason = byPlayer == null ? 'finished' : 'stopped';

        let winnerTeam = null;
        if (scores && scores.red > scores.blue) winnerTeam = Team.RED;
        if (scores && scores.blue > scores.red) winnerTeam = Team.BLUE;

        await db.analyticsEndMatch({
            matchId,
            endedAt: ts,
            dayKey,
            playersEnd,
            winnerTeam,
            endReason
        });

        await trackEvent({
            eventType: 'match_end',
            matchId,
            ts,
            payload: {
                byPlayerId: byPlayer?.id ?? null,
                red: scores?.red ?? null,
                blue: scores?.blue ?? null,
                winnerTeam,
                endReason,
                playersEnd
            }
        });

        state.analytics.currentMatchId = null;
    }

    async function captureOnlineSnapshot() {
        const ts = Date.now();
        await db.analyticsUpsertOnlineMinute({
            minuteTs: minuteBucket(ts),
            dayKey: getDayKey(ts),
            roomType,
            roomCategory,
            onlineCount: room.getPlayerList().length
        });
    }

    async function aggregateRecentDays() {
        const now = Date.now();
        const yesterday = now - 24 * 60 * 60 * 1000;

        await db.analyticsAggregateDaily(getDayKey(yesterday), roomCategory);
        await db.analyticsAggregateDaily(getDayKey(now), roomCategory);
    }

    return {
        onPlayerJoin,
        onPlayerLeave,
        onGameStart,
        onGameStop,
        captureOnlineSnapshot,
        aggregateRecentDays
    };
};