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
        if (state.training_mode || state.winstay_mode || state.mode !== Mods.PUBLIC) return;

        state.teamSize = _getActivePlayers().length >= upTeamSizePlayers
            ? defaultTeamSize + 1   
            : defaultTeamSize;
    }

    async function updateTeams() {
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
            await randomizeTeams();
        }
    }

    async function randomizeTeams() {
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
            let specs = getTeamArray(Team.SPECTATORS);
            let takeCount;
            const isWinstay = state.winstay_mode && state.winstay.streak > 0 && specs.length > state.teamSize*2 && specs.length-state.winstay.team.length >= state.teamSize;

            if (isWinstay) {
                const championIds = new Set(state.winstay.team.map(p => p.id));
                for (const player of state.winstay.team) {
                    room.setPlayerTeam(player.id, Team.RED);
                }
                specs = specs.filter(p => !championIds.has(p.id));
                takeCount = state.teamSize;
            } else {
                specs = getTeamArray(Team.SPECTATORS);
                state.winstay = {streak: 0, team: []}
                const maxOnField = state.teamSize * 2;
                takeCount = Math.min(specs.length, maxOnField);
                if (takeCount % 2 === 1) takeCount -= 1;
                if (takeCount < 2) {
                    state.randomize_sit = false;
                    return;
                }
            }

            const playerThreshold = Math.max(0, queueMatches);

            let priorityQueue = state.queue
                .filter(([, missed]) => missed >= playerThreshold)
                .sort((a, b) => b[1] - a[1]);

            const vips = specs.filter(p => {
                if (!vipQueueRoles.includes(await getRole(p))) return false;
                const queueData = state.queue.find(([id]) => id === p.id);
                const missedCount = queueData ? queueData[1] : 0;
                if (isWinstay) {
                    const vipThreshold = Math.max(0, queueMatches - 1);
                    return missedCount >= vipThreshold;
                }
                return true; 
            });

            if (vips.length > 0) {
                const vipLimit = state.teamSize <= 2 ? 1 : 2;
                const vipQueue = vips
                    .map(p => state.queue.find(q => q[0] === p.id))
                    .filter(Boolean)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, vipLimit);

                for (const vip of vipQueue) {
                    priorityQueue = priorityQueue.filter(q => q[0] !== vip[0]);
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
                used.add(rest[idx].id);
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

    function updateBallColor() {
        if (state.goal_sit) return;

        if (state.waitingForServe) {
            room.setDiscProperties(0, { color: state.ball_color });
            return;
        }

        let color = 0xffffff;

        if (state.serveBall) {
            color = 0x42f5d4;
        } else if (state.saveBall) {
            color = 0x03fc45;
        } else if (state.touches === 1) {
            color = 0xe0ca48;
        } else if (state.touches === 2) {
            color = 0xcc2929;
        }

        if (
            state.lastTouches[0] != null &&
            !state.serveBall &&
            !state.saveBall
        ) {
            const lastTeam = state.lastTouches[0][2];
            const ballPos = room.getBallPosition();

            const onEnemySide =
                (lastTeam === Team.RED  && (ballPos.x > 0.1 || (ballPos.y >= 68 && ballPos.x >= 0))) ||
                (lastTeam === Team.BLUE && (ballPos.x < -0.1 || (ballPos.y >= 68 && ballPos.x <= 0)));

            if (onEnemySide) {
                color = 0xffffff;
            }
        }

        if (state.ball_color !== color) {
            state.ball_color = color;
            room.setDiscProperties(0, { color });
        }
    }

    return {
        updateTeamSize,
        updateTeams,
        randomizeTeams,
        updateVipSlots,
        updateBallColor
    };
};