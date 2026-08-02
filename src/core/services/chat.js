module.exports = function createChatHelpers({
    room,
    getCommands
}) {

function getCommand(commandStr) {
    const commands = getCommands()
    if (commands.hasOwnProperty(commandStr)) return commandStr;
    for (const [key, value] of Object.entries(commands)) {
        for (let alias of value.aliases) {
            if (alias == commandStr) return key;
        }
    }
    return false;
}

function sendAnnouncementTeam(message, team, color, style, mention) {
    for (let player of team) {
        room.sendAnnouncement(message, player.id, color, style, mention);
    }
}

return {
    getCommand,
    sendAnnouncementTeam
}

};