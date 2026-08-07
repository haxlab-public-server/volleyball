const {
    sendVipPassword
} = require("../utils/utils")

module.exports = function createMiscEvents({
    room,
    getRole,
    roomName,
    state,
    vipWebhook
}) {

function onRoomLink(url) { 
    let d = new Date()
    console.log(`[${d.getDate()}.${d.getMonth()}.${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}] ${roomName} - ${url}`)
    console.log(`[${d.getDate()}.${d.getMonth()}.${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}] 🌟VIP-Пароль: ${state.vipPassword}`)
    sendVipPassword(vipWebhook, state.vipPassword)
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