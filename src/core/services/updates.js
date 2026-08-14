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
    vipSlots,
    Sits,
    TeamPickMode,
    getPickTeam,
    getCaptain,
    sendPickList
}) {
    const CAPTAIN_PICK_TIMEOUT_MS = 7000;

    function _getActivePlayers() {
        return room.getPlayerList().filter(
            p => state.afkList.findIndex(a => a[0] === p.id) === -1
        );
    }

    function _getTeamSize() {
        if (room.getScores() != null && state.game && state.game.teamSize) {
            return state.game.teamSize;
        }
        return state.teamSize;
    }

    function _isWinstay() {
        const specs = getTeamArray(Team.SPECTATORS);
        return (
            state.winstay_mode &&
            state.winstay.streak > 0 &&
            specs.length > state.teamSize * 2 &&
            specs.length - state.winstay.team.length >= state.teamSize
        );
    }

    function _canUseCaptains() {
        return (
            state.teamPickMode === TeamPickMode.CAPTAINS &&
            _getActivePlayers().length >= state.teamSize * 2 + 1 &&
            state.teamSize > 1
        );
    }

    function _hasPickChoice() {
        return getTeamArray(Team.SPECTATORS).length >= 2;
    }

    function _clearCaptainPickTimer() {
        if (state.captainPickTimer != null) {
            clearTimeout(state.captainPickTimer);
            state.captainPickTimer = null;
        }
    }

    function stopCaptainPick() {
        _clearCaptainPickTimer();
        state.captainPickForTeam = null;
        if (state.sit === Sits.CHOICE) {
            state.sit = room.getScores() != null ? Sits.GAME : Sits.NONE;
        }
        try {
            room.pauseGame(false);
        } catch (_) {}
    }

    function _autoFillSlot(red, blue, size) {
        const specs = getTeamArray(Team.SPECTATORS);
        if (specs.length === 0) return;

        if (red.length !== blue.length) {
            room.setPlayerTeam(
                specs[0].id,
                red.length < blue.length ? Team.RED : Team.BLUE
            );
            return;
        }

        if (blue.length < size && specs.length >= 2) {
            room.setPlayerTeam(specs[0].id, Team.RED);
            room.setPlayerTeam(specs[1].id, Team.BLUE);
            return;
        }
    }

    function updateTeamSize() {
        if (state.training_mode || state.winstay_mode || state.mode !== Mods.PUBLIC) return;

        state.teamSize = _getActivePlayers().length >= upTeamSizePlayers
            ? defaultTeamSize + 1
            : defaultTeamSize;
    }

    async function updateTeams() {
        if (state.mode !== Mods.PUBLIC || state.training_mode) return;
        if (state.sit === Sits.RANDOMIZE || state.sit === Sits.TIMEOUT || state.sit === Sits.FORMING) return;

        const red = getTeamArray(Team.RED);
        const blue = getTeamArray(Team.BLUE);
        const scores = room.getScores();
        const activeCount = _getActivePlayers().length;
        const size = _getTeamSize();

        if (state.sit === Sits.CHOICE) {
            if (red.length >= size && blue.length >= size) {
                stopCaptainPick();
                room.startGame();
                return;
            }
            await startCaptains();
            return;
        }

        if (scores != null) {
            if (activeCount <= 1 || red.length === 0 || blue.length === 0) {
                room.stopGame();
                return;
            }

            if (red.length < size || blue.length < size) {
                if (_canUseCaptains() && _hasPickChoice()) {
                    await startCaptains();
                    return;
                }
                _autoFillSlot(red, blue, size);
            }
            return;
        }

        if (activeCount >= 2 && state.sit === Sits.NONE) {
            await startPickingTeams();
        }
    }

    async function startPickingTeams() {
        if (_getActivePlayers().length < 2) return;

        if (state.teamPickMode === TeamPickMode.RANDOM || !_canUseCaptains()) {
            await randomizeTeams();
            return;
        }

        await startCaptains();
    }

    async function startCaptains() {
        if (state.sit === Sits.FORMING) return;
        
        const size = _getTeamSize();
        const red = getTeamArray(Team.RED);
        const blue = getTeamArray(Team.BLUE);
        const scores = room.getScores();
        let specs = getTeamArray(Team.SPECTATORS);

        if (state.sit === Sits.NONE) {
            state.sit = Sits.FORMING;
            if (_isWinstay()) {
                const championIds = new Set(state.winstay.team.map(p => p.id));
                for (const p of state.winstay.team) {
                    room.setPlayerTeam(p.id, Team.RED);
                }
                specs = specs.filter(p => !championIds.has(p.id));
                if (specs[0]) {
                    room.setPlayerTeam(specs[0].id, Team.BLUE);
                }
            } else {
                state.winstay = { streak: 0, team: [] };
                if (specs[0]) {
                    room.setPlayerTeam(specs[0].id, Team.RED);
                }
                if (specs[1]) {
                    room.setPlayerTeam(specs[1].id, Team.BLUE);
                }
            }
            state.sit = Sits.CHOICE;
            return;
        }

        if (getTeamArray(Team.RED).length >= size && getTeamArray(Team.BLUE).length >= size) {
            stopCaptainPick();
            if (scores == null) {
                room.startGame();
            }
            return;
        }

        if (!_hasPickChoice()) {
            _clearCaptainPickTimer();
            return;
        }

        const pickTeam = getPickTeam();
        if (pickTeam == null) {
            stopCaptainPick();
            if (scores == null) {
                room.startGame();
            }
            return;
        }

        state.sit = Sits.CHOICE;
        if (scores != null) {
            try {
                room.pauseGame(true);
            } catch (_) {}
        }

        const captain = getCaptain(pickTeam);
        if (captain == null) {
            specs = getTeamArray(Team.SPECTATORS);
            if (specs[0]) {
                room.setPlayerTeam(specs[0].id, pickTeam);
            }
            _clearCaptainPickTimer();
            return;
        }

        if (state.captainPickForTeam === pickTeam && state.captainPickTimer != null) {  
            return;
        }

        state.captainPickForTeam = pickTeam;
        _clearCaptainPickTimer();

        room.sendAnnouncement(
            `🧢 Ход капитана ${captain.name}`,
            null,
            pickTeam === Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE,
            'bold',
            HaxNotification.CHAT
        );
        sendPickList(captain);

        state.captainPickTimer = setTimeout(() => {
            state.captainPickTimer = null;
            if (state.sit !== Sits.CHOICE) return;

            const team = getPickTeam();
            const auto = getTeamArray(Team.SPECTATORS);
            if (team != null && auto[0]) {
                room.setPlayerTeam(auto[0].id, team);
                room.sendAnnouncement(
                    `⏰ Время вышло — выбран ${auto[0].name}`,
                    null,
                    Color.GR_RED,
                    'small',
                    HaxNotification.CHAT
                );
            }
        }, CAPTAIN_PICK_TIMEOUT_MS);
    }

    async function randomizeTeams() {
        stopCaptainPick();
        state.sit = Sits.RANDOMIZE;

        room.sendAnnouncement(
            `⚖️ Рандомизация команд...`,
            null,
            Color.GR_GREEN,
            'small',
            HaxNotification.NONE
        );

        setTimeout(async () => {
            let specs = getTeamArray(Team.SPECTATORS);
            let takeCount;
            const isWinstay = _isWinstay();

            if (isWinstay) {
                const championIds = new Set(state.winstay.team.map(p => p.id));
                for (const player of state.winstay.team) {
                    room.setPlayerTeam(player.id, Team.RED);
                }
                specs = specs.filter(p => !championIds.has(p.id));
                takeCount = state.teamSize;
            } else {
                specs = getTeamArray(Team.SPECTATORS);
                state.winstay = { streak: 0, team: [] };
                const maxOnField = state.teamSize * 2;
                takeCount = Math.min(specs.length, maxOnField);
                if (takeCount % 2 === 1) takeCount -= 1;
                if (takeCount < 2) {
                    state.sit = Sits.NONE;
                    return;
                }
            }

            const playerThreshold = Math.max(0, queueMatches);

            let priorityQueue = state.queue
                .filter(([, missed]) => missed >= playerThreshold)
                .sort((a, b) => b[1] - a[1]);

            const vips = [];
            for (const p of specs) {
                const role = await getRole(p);
                if (!vipQueueRoles.includes(role)) continue;
                const queueData = state.queue.find(([id]) => id === p.id);
                const missedCount = queueData ? queueData[1] : 0;
                if (isWinstay) {
                    const vipThreshold = Math.max(0, queueMatches - 1);
                    if (missedCount < vipThreshold) continue;
                }
                vips.push(p);
            }

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
        if (state.goal_sit || room.getScores() == null) return;

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
                (lastTeam === Team.RED && (ballPos.x > 0.1 || (ballPos.y >= 68 && ballPos.x >= 0))) ||
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
        startPickingTeams,
        startCaptains,
        stopCaptainPick,
        updateVipSlots,
        updateBallColor
    };
};