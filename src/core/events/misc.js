module.exports = function createMiscEvents({
    room,
    getRole,
    roomName,
    state,
    discordBot
}) {

function onRoomLink(url) { 
    let d = new Date()
    console.log(`[${d.getDate()}.${d.getMonth()}.${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}] ${roomName} - ${url}`)
    console.log(`[${d.getDate()}.${d.getMonth()}.${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}] 🌟VIP-Пароль: ${state.vipPassword}`)
    discordBot.sendVipPassword(state.vipPassword)
    discordBot.sendLog(`# [${d.getDate()}.${d.getMonth()}.${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}] ROOM ONLINE`)
}

function onPlayerAdminChange(changedPlayer, byPlayer) {
    if (byPlayer != null && getRole(byPlayer) <= getRole(changedPlayer) && byPlayer.id != changedPlayer.id && changedPlayer.admin == false) {
        room.setPlayerAdmin(byPlayer.id, false)
        room.setPlayerAdmin(changedPlayer.id, true)
    }
}

return {
    onRoomLink,
    onPlayerAdminChange
}

};