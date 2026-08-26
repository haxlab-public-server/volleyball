module.exports = function createMiscEvents({
    room,
    getRole,
    roomName,
    state,
    discordBot,
    timeFormat,
    t
}) {
    const { formatDate } = timeFormat;

    let hasFirstRoomLink = false;
    function onRoomLink(url) {
        state.roomLink = url;
        if (hasFirstRoomLink) return;

        const dateStr = formatDate();
        console.log(`[${dateStr}] ${roomName} - ${url}`);
        console.log(t('discordBot.vipPasswordHeader', { prefix: `[${dateStr}] `, password: state.vipPassword }));

        discordBot.sendVipPassword(state.vipPassword);
        discordBot.sendLog(t('discordBot.roomOnlineLog', { date: dateStr }));

        hasFirstRoomLink = true;
    }

    function onPlayerAdminChange(changedPlayer, byPlayer) {
        if (
            byPlayer == null ||
            byPlayer.id === changedPlayer.id ||
            changedPlayer.admin === true
        ) {
            return;
        }

        (async () => {
            const byPlayerRole = await getRole(byPlayer);
            const changedPlayerRole = await getRole(changedPlayer);

            if (byPlayerRole <= changedPlayerRole) {
                room.setPlayerAdmin(byPlayer.id, false);
                room.setPlayerAdmin(changedPlayer.id, true);
            }
        })();
    }

    return {
        onRoomLink,
        onPlayerAdminChange
    };
};