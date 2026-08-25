module.exports = function createUpdatesUtils({
    room,
    state,
    getTeamArray,
    getAuth,
    getRole,
    getRandomInt,
    Mods,
    Team,
    Role,
    Color,
    HaxNotification,
    defaultTeamSize,
    upTeamSizePlayers,
    queueMatches,
    vipQueueRoles,
    maxPlayers,
    vipSlots,
    Sits,
    transitionTo,
    TeamPickMode,
    getPickTeam,
    getCaptain,
    sendPickList,
    clearCaptainPickTimer,
    t
}) {
    const CAPTAIN_PICK_TIMEOUT_MS = 10_000;
    const CAPTAIN_ALERT_OFFSET_MS = 4_000;
    const RANDOMIZE_DELAY_MS = 3_000;
    const FILL_GUARD_LIMIT = 20;
    let randomizeTimer = null;

    function clearRandomizeTimer() {
        if (randomizeTimer != null) {
            clearTimeout(randomizeTimer);
            randomizeTimer = null;
        }
    }

    function setSit(nextSit) {
        if (nextSit !== Sits.CHOICE) clearCaptainPickTimer();
        if (nextSit !== Sits.RANDOMIZE) clearRandomizeTimer();
        transitionTo(nextSit);
    }

    function getActivePlayers() {
        return room.getPlayerList().filter(
            p => state.afkList.findIndex(a => a[0] === p.id) === -1
        );
    }

    function getTeamSize() {
        if (room.getScores() != null && state.game?.teamSize) {
            return state.game.teamSize;
        }
        return state.teamSize;
    }

    function getEffectivePickSize() {
        return state.sit === Sits.CHOICE && state.pickSize != null
            ? state.pickSize
            : getTeamSize();
    }

    function getPresentWinstayPlayers() {
        const auths = new Set(state.winstay.team);
        return room.getPlayerList().filter(p => auths.has(getAuth(p.id)));
    }

    function isWinstayActive() {
        if (!state.winstay_mode || state.winstay.streak <= 0) return false;

        const specs = getTeamArray(Team.SPECTATORS);
        const championsInSpecs = getPresentWinstayPlayers()
            .filter(p => specs.some(s => s.id === p.id))
            .length;

        return (
            specs.length > state.teamSize * 2 &&
            specs.length - championsInSpecs >= state.teamSize
        );
    }

    function canUseCaptains() {
        return (
            state.teamPickMode === TeamPickMode.CAPTAINS &&
            getActivePlayers().length >= state.teamSize * 2 + 1 &&
            state.teamSize > 1
        );
    }

    function hasPickChoice() {
        return getTeamArray(Team.SPECTATORS).length >= 2;
    }

    function resetWinstay() {
        state.winstay = { streak: 0, team: [] };
    }

    function applyWinstayToRed(size) {
        const present = getPresentWinstayPlayers();
        const toField = present.slice(0, size);

        for (const p of toField) {
            room.setPlayerTeam(p.id, Team.RED);
        }
        for (const p of present.slice(size)) {
            if (p.team !== Team.SPECTATORS) {
                room.setPlayerTeam(p.id, Team.SPECTATORS);
            }
        }
        return new Set(toField.map(p => p.id));
    }

    async function resolveVipUpBooking(specs) {
        const booking = state.vipUpBooking;
        if (booking == null) return null;

        const candidate = specs.find(p => getAuth(p.id) === booking.auth);
        if (candidate == null) {
            state.vipUpBooking = null;
            return null;
        }

        const role = await getRole(candidate);
        if (role < Role.VIP) {
            state.vipUpBooking = null;
            return null;
        }
        return candidate;
    }

    function tryFinishIfTeamsFull(size) {
        const red = getTeamArray(Team.RED);
        const blue = getTeamArray(Team.BLUE);

        if (red.length < size || blue.length < size || red.length !== blue.length) {
            return false;
        }

        stopCaptainPick();
        if (room.getScores() == null) room.startGame();
        return true;
    }

    function stopCaptainPick() {
        clearCaptainPickTimer();
        clearRandomizeTimer();
        state.captainPickForTeam = null;
        state.pickSize = null;
        state.pickUsedVipUpFor = null;

        if (state.sit === Sits.CHOICE) {
            setSit(room.getScores() != null ? Sits.GAME : Sits.NONE);
        }

        try {
            room.pauseGame(false);
        } catch (_) {}
    }

    function abandonStuckPick() {
        clearCaptainPickTimer();
        state.captainPickForTeam = null;
        state.pickSize = null;

        const red = getTeamArray(Team.RED);
        const blue = getTeamArray(Team.BLUE);
        const isUnresolved =
            (red.length > 0 || blue.length > 0) &&
            (red.length !== blue.length || room.getScores() == null);

        if (isUnresolved) {
            for (const p of red.concat(blue)) {
                room.setPlayerTeam(p.id, Team.SPECTATORS);
            }
            if (state.pickUsedVipUpFor != null && state.vipUpBooking == null) {
                state.vipUpBooking = state.pickUsedVipUpFor;
            }
        }

        state.pickUsedVipUpFor = null;
        setSit(room.getScores() != null ? Sits.GAME : Sits.NONE);

        try {
            room.pauseGame(false);
        } catch (_) {}

        return isUnresolved;
    }

    function startCaptainTimer(captain, pickTeam) {
        state.captainPickForTeam = pickTeam;
        clearCaptainPickTimer();

        const teamColor = pickTeam === Team.RED ? Color.TEAM_RED : Color.TEAM_BLUE;

        room.sendAnnouncement(
            t('captains.turnAnnounce', { captain: captain.name }),
            null,
            teamColor,
            'bold',
            HaxNotification.CHAT
        );
        sendPickList(captain);

        state.captainAlertTimer = setTimeout(() => {
            state.captainAlertTimer = null;
            if (state.sit !== Sits.CHOICE) return;

            room.sendAnnouncement(
                t('captains.timeWarning'),
                captain.id,
                Color.GR_RED,
                'bold',
                HaxNotification.CHAT
            );
            sendPickList(captain);
        }, CAPTAIN_PICK_TIMEOUT_MS - CAPTAIN_ALERT_OFFSET_MS);

        state.captainPickTimer = setTimeout(async () => {
            state.captainPickTimer = null;
            if (state.sit !== Sits.CHOICE) return;

            const team = getPickTeam();
            const remaining = getTeamArray(Team.SPECTATORS);

            if (team != null && remaining.length > 0) {
                const randomPlayer = remaining[getRandomInt(0, remaining.length)];
                room.setPlayerTeam(randomPlayer.id, team);

                room.sendAnnouncement(
                    t('captains.timeUp', { name: randomPlayer.name }),
                    null,
                    Color.GR_RED,
                    'bold',
                    HaxNotification.CHAT
                );

                try {
                    await continueCaptainPick();
                } catch (error) {
                    console.error('Failed to continue captain pick:', error);
                    setSit(Sits.NONE);
                }
            }
        }, CAPTAIN_PICK_TIMEOUT_MS);
    }

    function autoFillSlot(red, blue, size) {
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
        }
    }

    function fillTeamsUntilFullOrStuck(size) {
        for (let guard = 0; guard < FILL_GUARD_LIMIT; guard++) {
            const red = getTeamArray(Team.RED);
            const blue = getTeamArray(Team.BLUE);
            const specs = getTeamArray(Team.SPECTATORS);

            if (red.length >= size && blue.length >= size) return;
            if (specs.length === 0) return;

            const team = getPickTeam();
            if (team == null) return;

            room.setPlayerTeam(specs[0].id, team);
        }
    }

    async function placeVipOrFirst(specs, team, announcement) {
        const vip = await resolveVipUpBooking(specs);
        if (vip != null) {
            room.setPlayerTeam(vip.id, team);
            state.pickUsedVipUpFor = { auth: getAuth(vip.id), name: vip.name };
            state.vipUpBooking = null;

            room.sendAnnouncement(
                announcement(vip.name),
                null,
                Color.PINK,
                'bold',
                HaxNotification.CHAT
            );
            return specs.filter(p => p.id !== vip.id);
        }

        if (specs[0]) {
            room.setPlayerTeam(specs[0].id, team);
            return specs.slice(1);
        }
        return specs;
    }

    function updateTeamSize() {
        if (state.training_mode || state.mode !== Mods.PUBLIC) return;

        state.teamSize =
            getActivePlayers().length >= upTeamSizePlayers
                ? defaultTeamSize + 1
                : defaultTeamSize;
    }

    async function updateTeams() {
        if (state.mode !== Mods.PUBLIC || state.training_mode) return;
        if ([Sits.RANDOMIZE, Sits.TIMEOUT, Sits.FORMING].includes(state.sit)) return;

        if (state.sit === Sits.CHOICE) {
            return handleChoiceSit();
        }

        const size = getTeamSize();
        const red = getTeamArray(Team.RED);
        const blue = getTeamArray(Team.BLUE);
        const scores = room.getScores();
        const activeCount = getActivePlayers().length;

        if (scores != null) {
            if (activeCount <= 1 || red.length === 0 || blue.length === 0) {
                room.stopGame();
                return;
            }

            if (red.length < size || blue.length < size) {
                if (canUseCaptains() && hasPickChoice()) {
                    await startCaptains();
                } else {
                    autoFillSlot(red, blue, size);
                }
            }
            return;
        }

        if (activeCount >= 2 && state.sit === Sits.NONE) {
            await startPickingTeams();
        }
    }

    async function handleChoiceSit() {
        const size = getEffectivePickSize();

        if (tryFinishIfTeamsFull(size)) return;

        if (!canUseCaptains() || !hasPickChoice()) {
            fillTeamsUntilFullOrStuck(size);

            if (tryFinishIfTeamsFull(size)) return;

            if (!canUseCaptains()) {
                const wasUnresolved = abandonStuckPick();
                if (wasUnresolved && getActivePlayers().length >= 2) {
                    await startPickingTeams();
                }
            } else {
                clearCaptainPickTimer();
            }
            return;
        }

        await advanceCaptainPick(size);
    }

    async function startPickingTeams() {
        if (getActivePlayers().length < 2) return;

        if (state.teamPickMode === TeamPickMode.RANDOM || !canUseCaptains()) {
            await randomizeTeams();
            return;
        }
        await startCaptains();
    }

    async function startCaptains() {
        if (state.sit === Sits.FORMING) return;

        if (state.sit === Sits.NONE) {
            await initCaptainPick();
            return;
        }
        await advanceCaptainPick(getEffectivePickSize());
    }

    async function initCaptainPick() {
        setSit(Sits.FORMING);

        const size = getTeamSize();
        state.pickSize = size;
        state.pickUsedVipUpFor = null;

        let specs = getTeamArray(Team.SPECTATORS);

        if (isWinstayActive()) {
            const championIds = applyWinstayToRed(size);
            specs = specs.filter(p => !championIds.has(p.id));

            specs = await placeVipOrFirst(
                specs,
                Team.BLUE,
                name => t('up.captainBlue', { name })
            );
        } else {
            resetWinstay();

            specs = await placeVipOrFirst(
                specs,
                Team.RED,
                name => t('up.captainRed', { name })
            );

            if (specs[0]) {
                room.setPlayerTeam(specs[0].id, Team.BLUE);
            }
        }

        setSit(Sits.CHOICE);
    }

    async function advanceCaptainPick(size) {
        if (tryFinishIfTeamsFull(size)) return;

        if (!hasPickChoice()) {
            clearCaptainPickTimer();
            return;
        }

        const pickTeam = getPickTeam();
        if (pickTeam == null) {
            stopCaptainPick();
            if (room.getScores() == null) room.startGame();
            return;
        }

        setSit(Sits.CHOICE);
        if (room.getScores() != null) {
            try {
                room.pauseGame(true);
            } catch (_) {}
        }

        const captain = getCaptain(pickTeam);
        if (captain == null) {
            const remaining = getTeamArray(Team.SPECTATORS);
            if (remaining[0]) {
                room.setPlayerTeam(remaining[0].id, pickTeam);
            }
            clearCaptainPickTimer();
            return;
        }

        if (state.captainPickForTeam === pickTeam && state.captainPickTimer != null) {
            return;
        }

        startCaptainTimer(captain, pickTeam);
    }

    async function continueCaptainPick() {
        if (state.sit !== Sits.CHOICE) return;
        await handleChoiceSit();
    }

    async function randomizeTeams() {
        if (getTeamArray(Team.SPECTATORS).length < 2) {
            stopCaptainPick();
            return;
        }

        stopCaptainPick();
        setSit(Sits.RANDOMIZE);

        room.sendAnnouncement(
            t('captains.randomizing'),
            null,
            Color.GR_GREEN,
            'small',
            HaxNotification.NONE
        );

        clearRandomizeTimer();
        randomizeTimer = setTimeout(async () => {
            randomizeTimer = null;
            if (state.sit !== Sits.RANDOMIZE) return;

            try {
                await performRandomize();
            } catch (error) {
                console.error('Failed to randomize teams:', error);
                setSit(Sits.NONE);
            }
        }, RANDOMIZE_DELAY_MS);
    }

    async function performRandomize() {
        let specs = getTeamArray(Team.SPECTATORS);
        const winstay = isWinstayActive();
        let takeCount;

        if (winstay) {
            const size = state.teamSize;
            const championIds = applyWinstayToRed(size);
            specs = specs.filter(p => !championIds.has(p.id));
            takeCount = size;
        } else {
            resetWinstay();
            const maxOnField = state.teamSize * 2;
            takeCount = Math.min(specs.length, maxOnField);
            if (takeCount % 2 === 1) takeCount -= 1;
            if (takeCount < 2) {
                setSit(Sits.NONE);
                return;
            }
        }

        const selectedIds = await selectPlayersForRandomize(specs, takeCount, winstay);

        if (winstay) {
            for (const id of selectedIds) {
                room.setPlayerTeam(id, Team.BLUE);
            }
        } else {
            for (let i = selectedIds.length - 1; i > 0; i--) {
                const j = getRandomInt(0, i + 1);
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
    }

    async function selectPlayersForRandomize(specs, takeCount, isWinstay) {
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
            const idx = getRandomInt(0, rest.length);
            selectedIds.push(rest[idx].id);
            used.add(rest[idx].id);
            rest.splice(idx, 1);
        }

        return selectedIds;
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
        continueCaptainPick,
        updateVipSlots,
        updateBallColor
    };
};