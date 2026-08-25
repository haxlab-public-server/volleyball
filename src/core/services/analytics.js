const ANALYTICS_TIME_ZONE = 'Europe/Moscow';

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ANALYTICS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

function getDayKey(ts = Date.now()) {
    const parts = dayKeyFormatter.formatToParts(new Date(ts));
    const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
}

function minuteBucket(ts = Date.now()) {
    return Math.floor(ts / 60000) * 60000;
}

function safeRandomId(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}_${crypto.randomUUID()}`;
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = function createAnalyticsService({
    room,
    state,
    db,
    roomLabel,
    Team
}) {
    const roomType = String(roomLabel || 'unknown').toLowerCase();

    if (!state.analytics) {
        state.analytics = {
            sessionsByAuth: {},
            currentMatchId: null
        };
    }

    async function trackEvent({ eventType, auth = null, sessionId = null, matchId = null, payload = null, ts = Date.now() }) {
        await db.analyticsAddEvent({
            eventId: safeRandomId('evt'),
            ts,
            dayKey: getDayKey(ts),
            eventType,
            roomType,
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
            roomType
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

    async function onGameStart() {
        const ts = Date.now();
        const dayKey = getDayKey(ts);
        const matchId = safeRandomId('match');
        const playersStart = room.getPlayerList().filter((p) => p.team !== Team.SPECTATORS).length;

        await db.analyticsStartMatch({
            matchId,
            startedAt: ts,
            dayKey,
            roomType,
            playersStart
        });

        state.analytics.currentMatchId = matchId;

        await trackEvent({
            eventType: 'match_start',
            matchId,
            ts,
            payload: { playersStart }
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
            onlineCount: room.getPlayerList().length
        });
    }

    async function aggregateRecentDays() {
        const now = Date.now();
        const yesterday = now - 24 * 60 * 60 * 1000;

        await db.analyticsAggregateDaily(getDayKey(yesterday));
        await db.analyticsAggregateDaily(getDayKey(now));
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
