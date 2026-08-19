module.exports = function createMiscEvents({
    room,
    getRole,
    roomName,
    state,
    discordBot
}) {
    function formatDate(d = new Date()) {
        const formatter = new Intl.DateTimeFormat('ru-RU', {
            timeZone: 'Europe/Moscow',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return formatter.format(d).replace(', ', ' ');
    }

    let hasFirstRoomLink = false;
    function onRoomLink(url) {
        state.roomLink = url;
        if (hasFirstRoomLink) return;

        const dateStr = formatDate();
        console.log(`[${dateStr}] ${roomName} - ${url}`);
        console.log(`[${dateStr}] 🌟VIP-Пароль: ${state.vipPassword}`);

        discordBot.sendVipPassword(state.vipPassword);
        discordBot.sendLog(`**[${dateStr}] ROOM ONLINE**`);

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