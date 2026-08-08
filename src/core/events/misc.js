module.exports = function createMiscEvents({
    room,
    getRole,
    roomName,
    state,
    discordBot
}) {
    function formatDate(d = new Date()) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    }

    function onRoomLink(url) {
        const dateStr = formatDate();

        console.log(`[${dateStr}] ${roomName} - ${url}`);
        console.log(`[${dateStr}] 🌟VIP-Пароль: ${state.vipPassword}`);

        discordBot.sendVipPassword(state.vipPassword);
        discordBot.sendLog(`# [${dateStr}] ROOM ONLINE`);
    }

    function onPlayerAdminChange(changedPlayer, byPlayer) {
        if (
            byPlayer == null ||
            byPlayer.id === changedPlayer.id ||
            changedPlayer.admin === true
        ) {
            return;
        }

        if (getRole(byPlayer) <= getRole(changedPlayer)) {
            room.setPlayerAdmin(byPlayer.id, false);
            room.setPlayerAdmin(changedPlayer.id, true);
        }
    }

    return {
        onRoomLink,
        onPlayerAdminChange
    };
};