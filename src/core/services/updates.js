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
    function _getActivePlayers() {
        return room.getPlayerList().filter(
            p => state.afkList.findIndex(a => a[0] === p.id) === -1
        );
    }

    function updateTeamSize() {
        if (state.training_mode || state.mode !== Mods.PUBLIC) return;

        if (state.winstay_mode) {
            state.teamSize = defaultTeamSize;
            return;
        }

        state.teamSize = _getActivePlayers().length >= upTeamSizePlayers
            ? defaultTeamSize + 1
            : defaultTeamSize;
    }

    function updateTeams() {
        if (state.mode !== Mods.PUBLIC || state.training_mode) return;
        if (state.randomize_sit) return;

        const red = getTeamArray(Team.RED);
        const blue = getTeamArray(Team.BLUE);
        const specs = getTeamArray(Team.SPECTATORS);
        const scores = room.getScores();
        const activeCount = _getActivePlayers().length;

        if (scores != null) {
            if (red.length !== blue.length && specs.length > 0) {
                const targetTeam = red.length < blue.length ? Team.RED : Team.BLUE;
                room.setPlayerTeam(specs[0].id, targetTeam);
            } else if (
                red.length === blue.length &&
                blue.length < state.game.teamSize &&
                specs.length >= 2
            ) {
                room.setPlayerTeam(specs[0].id, Team.RED);
                room.setPlayerTeam(getTeamArray(Team.SPECTATORS)[0].id, Team.BLUE);
            }

            if (activeCount <= 1 || red.length === 0 || blue.length === 0) {
                room.stopGame();
            }
            return;
        }

        if (activeCount >= 2) {
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
            const specs = getTeamArray(Team.SPECTATORS);
            const isWinstay = state.winstay_mode && state.winstay.streak > 0 && specs.length >= state.teamSize;

            let takeCount;
            if (isWinstay) {
                for (const player of state.winstay.team) {
                    room.setPlayerTeam(player.id, Team.RED);
                }
                takeCount = state.teamSize;
            } else {
                const maxOnField = state.teamSize * 2;
                takeCount = Math.min(specs.length, maxOnField);
                if (takeCount % 2 === 1) takeCount -= 1;

                if (takeCount < 2) {
                    state.randomize_sit = false;
                    return;
                }
            }

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

            const selectedIds = [];
            const used = new Set();

            for (const [id] of priorityQueue) {
                if (selectedIds.length >= takeCount) break;
                if (specs.some(p => p.id === id)) {
                    selectedIds.push(id);
                    used.add(id);
                }
            }

            const rest = specs.filter(p => !used.has(p.id));
            while (selectedIds.length < takeCount && rest.length > 0) {
                const idx = getRandomInt(0, rest.length - 1);
                selectedIds.push(rest[idx].id);
                rest.splice(idx, 1);
            }

            if (isWinstay) {
                for (const id of selectedIds) {
                    room.setPlayerTeam(id, Team.BLUE);
                }
            } else {
                for (let i = selectedIds.length - 1; i > 0; i--) {
                    const j = getRandomInt(0, i);
                    [selectedIds[i], selectedIds[j]] = [selectedIds[j], selectedIds[i]];
                }

                const half = selectedIds.length / 2;
                for (let i = 0; i < selectedIds.length; i++) {
                    room.setPlayerTeam(
                        selectedIds[i],
                        i < half ? Team.RED : Team.BLUE
                    );
                }
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