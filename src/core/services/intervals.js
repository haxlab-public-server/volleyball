const createAnnouncementMessages = require('../announcementMessages');

module.exports = function createIntervals({
    room,
    state,
    cf,
    db,
    muteArray,
    lastIds,
    getRandomInt,
    discordBot,
    getTeamArray,
    checkRoles,
    updateTeams,
    maxInactivity,
    Team,
    Mods,
    Color,
    Serve,
    HaxNotification,
    updateVipSlots,
    updateBallColor,
    Sits,
    Discord,
    Telegram,
    roomName,
    maxPlayers,
    analytics,
    timeFormat,
    t
}) {
    const announcementMessages = createAnnouncementMessages({ Discord, Telegram, t });
    const { formatDate } = timeFormat;

    const FLOAT_SERVE_NET_SLOWDOWN = 0.4;

    function resetBallKick() {
        state.ball_color = 0xffffff;
        const disc = room.getDiscProperties(0);
        room.setDiscProperties(0, {
            cGroup: disc.cGroup | cf.kick,
            color: state.ball_color
        });
    }

    let announcementIndex = 0;

    setInterval(() => {
        room.sendAnnouncement(
            announcementMessages[announcementIndex++ % announcementMessages.length],
            null,
            Color.WH_BLUE,
            'bold',
            HaxNotification.CHAT
        );
    }, 10 * 60 * 1000);

    setInterval(() => {
        state.vipPassword = getRandomInt(100000, 999999);
        discordBot.sendVipPassword(state.vipPassword);
        console.log(t('intervals.vipPasswordConsoleLine', { date: formatDate(), password: state.vipPassword }));
        updateVipSlots();
    }, 60 * 60 * 1000);

    setInterval(async () => {
        const now = Date.now();
        const expired = await db.getExpiredBans(now);

        for (const ban of expired) {
            if (ban.id != null) room.clearBan(ban.id);
        }

        await db.removeExpiredBans(now);
        await muteArray.checkMutes();
        await muteArray.updateMutes();
        await checkRoles();

        if (room.getPlayerList().length > 0) {
            const lastIdsList = Object.values(lastIds);

            for (const player of room.getPlayerList()) {
                const entry = lastIdsList.find(k => k[0] === player.id);
                if (entry) {
                    await db.incrementStat(entry[2], 10);
                }
            }
        }
    }, 60 * 1000);

    setInterval(() => {
        if (room.getScores() == null || state.sit == Sits.CHOICE) return;
        if (state.mode !== Mods.PUBLIC) return;

        const warningThreshold = maxInactivity - Math.round(maxInactivity / 3);
        const players = getTeamArray(Team.RED).concat(getTeamArray(Team.BLUE));

        for (const player of players) {
            state.inactivityTicks[player.id]++;

            if (state.inactivityTicks[player.id] >= maxInactivity) {
                room.kickPlayer(player.id, t('afk.afkKick', { name: player.name }), false);
            } else if (state.inactivityTicks[player.id] === warningThreshold) {
                room.sendAnnouncement(
                    t('intervals.inactivityWarning', { seconds: Math.round(maxInactivity / 3) }),
                    player.id,
                    Color.GR_RED,
                    'bold',
                    HaxNotification.MENTION
                );
            }
        }
    }, 1000);

    setInterval(() => {
        const list = room.getPlayerList();
        const names = list.length > 0 ? list.map(p => p.name).join(', ') : '';

        discordBot.updateOnlineMessage({
            title: roomName,
            playersLine: names,
            count: list.length,
            maxPlayers,
            roomLink: state.roomLink ?? null
        });
    }, 60 * 1000);

    setInterval(() => {
        analytics.captureOnlineSnapshot().catch((error) => {
            console.error('Error in analytics.captureOnlineSnapshot:', error);
        });
    }, 60 * 1000);

    setInterval(() => {
        analytics.aggregateRecentDays().catch((error) => {
            console.error('Error in analytics.aggregateRecentDays:', error);
        });
    }, 15 * 60 * 1000);

    // onGameTick replacement
    setInterval(async () => {
        await updateTeams();
        if (room.getScores() == null) return;

        const ballPos = room.getBallPosition();

        if (!state.goal_sit && state.serveBall) {
            if (state.serveType === Serve.FLOAT && !state.floatSlowed) {
                const crossedNet =
                    (state.serve === Team.RED && ballPos.x >= 0) ||
                    (state.serve === Team.BLUE && ballPos.x <= 0);

                if (crossedNet) {
                    const disc = room.getDiscProperties(0);
                    room.setDiscProperties(0, {
                        xspeed: disc.xspeed * FLOAT_SERVE_NET_SLOWDOWN,
                        yspeed: disc.yspeed //* FLOAT_SERVE_NET_SLOWDOWN
                    });
                    state.floatSlowed = true;
                }
            }

            const crossedBlock =
                (state.serve === Team.RED &&
                    ((ballPos.y >= 68 && ballPos.x >= 0.1) || ballPos.x >= 100)) ||
                (state.serve === Team.BLUE &&
                    ((ballPos.y >= 68 && ballPos.x <= -0.1) || ballPos.x <= -100));

            if (crossedBlock) {
                state.serveBall = false;
                state.floatSlowed = false;
                resetBallKick();
            }
            updateBallColor();
            return;
        }

        if (!state.goal_sit && state.saveBall) {
            const lastTeam = state.lastTouches[0]?.[2];
            const crossed =
                (lastTeam === Team.RED &&
                    ((ballPos.y >= 68 && ballPos.x >= 0.1) || ballPos.x >= 100)) ||
                (lastTeam === Team.BLUE &&
                    ((ballPos.y >= 68 && ballPos.x <= -0.1) || ballPos.x <= -100));

            if (crossed) {
                state.saveBall = false;
                resetBallKick();
            }
            updateBallColor();
            return;
        }

        if (!state.goal_sit) {
            updateBallColor();
        }
    }, 50);
};