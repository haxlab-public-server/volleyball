const announcementMessages = require('../announcementMessages');

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
    HaxNotification,
    updateVipSlots,
    updateBallColor
}) {
    function formatDate(d = new Date()) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    }

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
        console.log(`[${formatDate()}] 🌟Новый VIP-Пароль: ${state.vipPassword}`);
        updateVipSlots();
    }, 60 * 60 * 1000);

    setInterval(() => {
        const now = Date.now();
        const expired = await db.getExpiredBans(now);

        for (const ban of expired) {
            if (ban.id != null) room.clearBan(ban.id);
        }

        await db.removeExpiredBans(now);

        await muteArray.checkMutes();
        await muteArray.updateMutes();
        checkRoles();

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
        if (state.mode !== Mods.PUBLIC) return;

        const warningThreshold = maxInactivity - Math.round(maxInactivity / 3);
        const players = getTeamArray(Team.RED).concat(getTeamArray(Team.BLUE));

        for (const player of players) {
            state.inactivityTicks[player.id]++;

            if (state.inactivityTicks[player.id] >= maxInactivity) {
                room.kickPlayer(player.id, 'АФК на площадке', false);
            } else if (state.inactivityTicks[player.id] === warningThreshold) {
                room.sendAnnouncement(
                    `⛔️Если ты не проявишь признаки жизни в течении ${Math.round(maxInactivity / 3)}сек, ты будешь кикнут`,
                    player.id,
                    Color.GR_RED,
                    'bold',
                    HaxNotification.MENTION
                );
            }
        }
    }, 1000);

    // onGameTick replacement
    setInterval(() => {
        if (room.getScores() == null) return;

        updateTeams();

        const ballPos = room.getBallPosition();

        if (!state.goal_sit && state.serveBall) {
            const crossed =
                (state.serve === Team.RED &&
                    ((ballPos.y >= 68 && ballPos.x >= 0.1) || ballPos.x >= 100)) ||
                (state.serve === Team.BLUE &&
                    ((ballPos.y >= 68 && ballPos.x <= -0.1) || ballPos.x <= -100));

            if (crossed) {
                state.serveBall = false;
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