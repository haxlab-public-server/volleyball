module.exports = function createUpdatesUtils({
    room,
    state,
    getTeamArray,
    getRole,
    getRandomInt,
    Mods,
    Team,
    Color,
    HaxNotification,
    defaultTeamSize,
    upTeamSizePlayers,
    queueMatches,
    vipQueueRoles,
    maxPlayers,
    vipSlots
}) {
    function getActivePlayers() {
        return room.getPlayerList().filter(
            p => state.afkList.findIndex(a => a[0] === p.id) === -1
        );
    }

    function updateTeamSize() {
        if (state.training_mode || state.mode !== Mods.PUBLIC) return;

        state.teamSize = getActivePlayers().length >= upTeamSizePlayers
            ? defaultTeamSize + 1
            : defaultTeamSize;
    }

    function updateTeams() {
        if (state.mode !== Mods.PUBLIC || state.training_mode) return;

        const red = getTeamArray(Team.RED);
        const blue = getTeamArray(Team.BLUE);
        const specs = getTeamArray(Team.SPECTATORS);
        const scores = room.getScores();
        const activeCount = getActivePlayers().length;

        if (red.length !== blue.length && specs.length > 0 && scores != null) {
            const targetTeam = red.length < blue.length ? Team.RED : Team.BLUE;
            room.setPlayerTeam(specs[0].id, targetTeam);
        }
        else if (
            red.length === blue.length &&
            blue.length < state.game.teamSize &&
            specs.length >= 2 &&
            scores != null
        ) {
            room.setPlayerTeam(specs[0].id, Team.RED);
            room.setPlayerTeam(getTeamArray(Team.SPECTATORS)[0].id, Team.BLUE);
        }

        if (activeCount <= 1 || red.length === 0 || blue.length === 0) {
            room.stopGame();
        }

        if (activeCount >= 2 && scores == null) {
            randomizeTeams();
        }
    }

    function randomizeTeams() {
        if (state.randomize_sit) return;

        state.randomize_sit = true;

        room.sendAnnouncement(
            `⚖️ Рандомизация команд...`,
            null,
            Color.GR_GREEN,
            'small',
            HaxNotification.NONE
        );

        setTimeout(() => {
            const needed = state.teamSize * 2;
            const specs = getTeamArray(Team.SPECTATORS);

            let priorityQueue = state.queue
                .filter(([, missed]) => missed >= queueMatches)
                .sort((a, b) => b[1] - a[1]);

            const vips = specs.filter(p => vipQueueRoles.includes(getRole(p)));
            if (vips.length > 0) {
                const vipLimit = state.teamSize <= 2 ? 1 : 2;

                const vipQueue = vips
                    .map(p => state.queue.find(q => q[0] === p.id))
                    .filter(Boolean)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, vipLimit);

                for (const vip of vipQueue) {
                    const idx = priorityQueue.findIndex(q => q[0] === vip[0]);
                    if (idx !== -1) priorityQueue.splice(idx, 1);
                    priorityQueue.unshift(vip);
                }
            }

            let fromQueue;
            if (specs.length < needed) {
                const gap = needed - specs.length + priorityQueue.length;
                fromQueue = gap % 2 === 1 ? gap + 1 : gap;
            } else if (priorityQueue.length > 0 && priorityQueue.length < needed) {
                fromQueue = priorityQueue.length;
            } else if (priorityQueue.length >= needed) {
                fromQueue = needed;
            } else {
                fromQueue = 0;
            }

            const selectedIds = priorityQueue
                .slice(0, Math.min(priorityQueue.length, needed))
                .map(([id]) => id);

            let remaining = specs.filter(p => !selectedIds.includes(p.id));

            if (fromQueue !== needed) {
                const toFill = needed - fromQueue;
                for (let i = 0; i < toFill && remaining.length > 0; i++) {
                    const idx = getRandomInt(0, remaining.length);
                    selectedIds.push(remaining[idx].id);
                    remaining.splice(idx, 1);
                }
            }

            let nextTeam = Team.RED;
            while (selectedIds.length > 0) {
                const idx = getRandomInt(0, selectedIds.length);
                room.setPlayerTeam(selectedIds[idx], nextTeam);
                selectedIds.splice(idx, 1);
                nextTeam = nextTeam === Team.RED ? Team.BLUE : Team.RED;
            }

            room.startGame();
        }, 3000);
    }

    function updateVipSlots() {
        const players = room.getPlayerList();

        if (players.length >= maxPlayers - vipSlots) {
            room.setPassword(`${state.vipPassword}`);
        } else {
            room.setPassword(state.roomPassword !== '' ? state.roomPassword : null);
        }
    }

    return {
        updateTeamSize,
        updateTeams,
        randomizeTeams,
        updateVipSlots
    };
};