module.exports = function createMovementEvents({
    room,
    state,
    lastIds,
    db,
    getAuth,
    getConn,
    getRole,
    updateVipSlots,
    updateTeams,
    updateTeamSize,
    stopTrainingMode,
    GhostKick,
    Role,
    Team,
    Mods,
    Color,
    HaxNotification,
    Discord,
    Telegram,
    maxPlayers,
    discordBot,
    Sits,
    getPickTeam,
    getCaptain,
    sendPickList,
    analytics,
    t
}) {
    function onPlayerJoin(player) {
        if (GhostKick && room.getPlayerList().length > 1) {
            const alreadyOnline = room.getPlayerList()
                .filter(p => p.id !== player.id)
                .some(p => 
                    getConn(p.id) === player.conn || 
                    getAuth(p.id) === player.auth
                );

            if (alreadyOnline) {
                room.kickPlayer(player.id, t('join.alreadyOnline'), false);
                return;
            }
        }

        lastIds[player.auth] = [player.id, player.conn, player.auth];

        (async () => {
            await db.ensureAccount(player.auth, player.name);

            const ban = await db.findBan(player.auth, player.conn);

            if (ban) {
                await db.updateBan(ban.rowid, {
                    id: player.id,
                    name: player.name,
                    conn: player.conn,
                    auth: player.auth
                });

                const minsLeft = Math.round((ban.date - Date.now()) / 1000 / 60);
                setTimeout(() => {
                    room.kickPlayer(
                        player.id,
                        t('join.banned', { mins: minsLeft, discord: Discord }),
                        true
                    );
                }, 700);
                return;
            }

            if (state.joinAuths && await getRole(player) < Role.ADMIN) {
                if (!(await db.hasAuth(player.auth))) {
                    setTimeout(() => {
                        room.kickPlayer(
                            player.id,
                            t('join.authOnly', { discord: Discord }),
                            false
                        );
                    }, 700);
                    return;
                }
            }

            state.inactivityTicks[player.id] = 0;
            state.queue.push([player.id, 0]);

            await db.addNickname(player.auth, player.name);
            await db.ensureStat(player.auth, player.name);
            await analytics.onPlayerJoin(player);

            const role = await getRole(player);
            const roleKey = Object.keys(Role).find(key => Role[key] === role)?.toLowerCase();
            const roleName = t(`role.names.${roleKey ?? 'player'}`);

            discordBot.syncRole(player.auth);

            if (role >= Role.ADMIN) {
                room.setPlayerAdmin(player.id, true);
                room.sendAnnouncement(
                    t('join.announceAdmin', { roleName, name: player.name }),
                    null,
                    Color.RED,
                    'bold',
                    HaxNotification.CHAT
                );
            } else if (role === Role.VIP) {
                if (state.mode === Mods.PRIVATE) {
                    room.setPlayerAdmin(player.id, true);
                }
                room.sendAnnouncement(
                    t('join.announceVip', { roleName, name: player.name }),
                    null,
                    Color.PINK,
                    'bold',
                    HaxNotification.CHAT
                );
            } else if (role === Role.PREADMIN) {
                room.setPlayerAdmin(player.id, true);
                room.sendAnnouncement(
                    t('join.announcePreadmin', { roleName, name: player.name }),
                    null,
                    Color.RED,
                    'bold',
                    HaxNotification.CHAT
                );
            }

            room.sendAnnouncement(
                t('join.welcome', { discord: Discord, telegram: Telegram, contactTelegram: 'chesdes' }),
                player.id,
                Color.GR_GREEN,
                'small',
                HaxNotification.NONE
            );

            if (state.sit == Sits.CHOICE) {
                sendPickList(getCaptain(getPickTeam()));
            }

            updateVipSlots();
            await updateTeams();
            updateTeamSize();

            discordBot.sendLog(
                `${player.auth} / ${player.conn} | **${player.name}** join ${room.getPlayerList().length}/${maxPlayers}`
            );
        })().catch((error) => {
            console.error('Error in room.onPlayerJoin:', error);
        });
    }

    function onPlayerLeave(player) {
        state.queue = state.queue.filter(p => p[0] !== player.id);
        state.afkList = state.afkList.filter(p => p[0] !== player.id);
        state.inactivityTicks[player.id] = 0;

        player.auth = getAuth(player.id);

        room.sendAnnouncement(
            t('join.leaveIdEcho', { name: player.name, auth: player.auth }),
            null,
            Color.GR_GREEN,
            'small',
            HaxNotification.NONE
        );

        if (state.sit == Sits.CHOICE) {
            sendPickList(getCaptain(getPickTeam()));
        }

        if (state.training_mode && room.getPlayerList().length === 0) {
            stopTrainingMode();
        }

        (async () => {
            await analytics.onPlayerLeave(player, 'leave');
            updateVipSlots();
            await updateTeams();
            updateTeamSize();
        })().catch((error) => {
            console.error('Error in room.onPlayerLeave:', error);
        });

        discordBot.sendLog(
            `[${player.auth}] **${player.name}** leave ${room.getPlayerList().length}/${maxPlayers}`
        );
    }

    function onPlayerKicked(kickedPlayer, reason, ban, byPlayer) {
        if (byPlayer != null) {
            
            (async () => {
                const byRole = await getRole(byPlayer);
                const kickedRole = await getRole(kickedPlayer);

                if ((ban && byRole < Role.MASTER) || kickedPlayer.id === byPlayer.id) {
                    room.clearBan(kickedPlayer.id);
                    room.setPlayerAdmin(byPlayer.id, false);
                }
                else if (
                    (ban && byRole <= kickedRole) ||
                    (kickedPlayer.id !== byPlayer.id && byRole < Role.MASTER)
                ) {
                    room.setPlayerAdmin(byPlayer.id, false);
                }
                })().catch((error) => {
                    console.error('Error in room.onPlayerKicked:', error);
                });

            discordBot.sendLog(
                `[${kickedPlayer.auth}] **${kickedPlayer.name}** was ${ban ? 'banned' : 'kicked'} by **${byPlayer.name}** | ${byPlayer.auth} / ${byPlayer.conn}`
            );
        }
    }

    function onPlayerTeamChange(changedPlayer, byPlayer) {
        if (
            state.afkList.some(p => p[0] === changedPlayer.id) &&
            changedPlayer.team !== Team.SPECTATORS
        ) {
            room.setPlayerTeam(changedPlayer.id, Team.SPECTATORS);
            room.sendAnnouncement(
                t('afk.forcedToSpectate', { name: changedPlayer.name }),
                byPlayer?.id,
                Color.GR_RED,
                'small',
                HaxNotification.MENTION
            );
            return;
        }

        state.inactivityTicks[changedPlayer.id] = 0;

        const queueIdx = state.queue.findIndex(p => p[0] === changedPlayer.id);
        if (queueIdx !== -1) {
            state.queue[queueIdx][1] = 0;
        }

        if (room.getScores() != null && changedPlayer.team !== Team.SPECTATORS && byPlayer == null) {
            room.sendAnnouncement(
                t('join.wentInGame', { name: changedPlayer.name }),
                changedPlayer.id,
                Color.WH_BLUE,
                'bold',
                HaxNotification.MENTION
            );
        }
    }

    return {
        onPlayerJoin,
        onPlayerLeave,
        onPlayerKicked,
        onPlayerTeamChange
    };
};