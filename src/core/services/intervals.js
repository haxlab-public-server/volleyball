const announcementMessages = require('../announcementMessages');

module.exports = function createIntervals({
    room,
    state,
    cf,
    fs,
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
    updateVipSlots
}) {
    function loadJson(filename) {
        // TODO: migrate from fs to sqlite in the future
        return JSON.parse(fs.readFileSync(filename, 'utf8'));
    }

    function saveJson(filename, data) {
        // TODO: migrate from fs to sqlite in the future
        fs.writeFileSync(filename, JSON.stringify(data));
    }

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
        let banList = loadJson('bans.json');
        const now = Date.now();

        banList = banList.filter(ban => {
            if (ban.date >= now) return true;
            if (ban.id != null) room.clearBan(ban.id);
            return false;
        });

        saveJson('bans.json', banList);

        muteArray.checkMutes();
        muteArray.updateMutes();
        checkRoles();

        if (room.getPlayerList().length > 0) {
            const stats = loadJson('stats.json');
            const lastIdsList = Object.values(lastIds);

            for (const player of room.getPlayerList()) {
                const entry = lastIdsList.find(k => k[0] === player.id);
                if (entry) {
                    stats[entry[2]][10] += 1;
                }
            }

            saveJson('stats.json', stats);
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
        }

        if (!state.goal_sit && state.lastTouches[0] != null) {
            const lastTeam = state.lastTouches[0][2];

            if (
                (ballPos.x > 0.1 && lastTeam === Team.RED) ||
                (ballPos.x < -0.1 && lastTeam === Team.BLUE)
            ) {
                if (state.ball_color !== 0xffffff) {
                    state.ball_color = 0xffffff;
                    room.setDiscProperties(0, { color: state.ball_color });
                }
            }
        }

        updateTeams();
    }, 50);
};