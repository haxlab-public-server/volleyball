module.exports = function createCaptainsHelpers({
    room,
    state,
    getTeamArray,
    Team,
    Color,
    HaxNotification
}) {

function _clearCaptainPickTimer() {
    if (state.captainPickTimer != null) {
        clearTimeout(state.captainPickTimer);
        state.captainPickTimer = null;
    }
}

function getPickTeam() {
    const size = (room.getScores() != null && state.game?.teamSize)
        ? state.game.teamSize
        : state.teamSize;
    const redN = getTeamArray(Team.RED).length;
    const blueN = getTeamArray(Team.BLUE).length;

    if (redN < blueN) return Team.RED;
    if (blueN < redN) return Team.BLUE;
    if (redN < size) return Team.RED;
    if (blueN < size) return Team.BLUE;
    return null;
}

function getCaptain(team) {
    return getTeamArray(team)[0] ?? null;
}

function isCurrentPickingCaptain(player) {
    if (!player) return false;
    const pickTeam = getPickTeam();
    if (pickTeam == null) return false;
    const cap = getCaptain(pickTeam);
    return cap != null && cap.id === player.id;
}

function sendPickList(captain) {
    const specs = getTeamArray(Team.SPECTATORS);

    const specsList = specs
        .map((p, index) => `[${index + 1}] ${p.name}`)
        .join(', ');

    room.sendAnnouncement(
        `Выберите игрока: ${specsList}`,
        captain.id,
        Color.GREY,
        'bold',
        HaxNotification.CHAT
    );
}

function capPick(captain, team, num) {
    const specs = getTeamArray(Team.SPECTATORS);

    if (num > 0 && num <= specs.length) {
        const chosen = specs[num - 1];
        room.setPlayerTeam(chosen.id, team);
        room.sendAnnouncement(
            `${captain.name} выбрал ${chosen.name}`,
            null,
            Color.WH_BLUE,
            'bold',
            HaxNotification.CHAT
        );
        _clearCaptainPickTimer();
        return true;
    }

    room.sendAnnouncement(
        `Такого номера нет в списке!`,
        captain.id,
        Color.GR_RED,
        'bold',
        HaxNotification.MENTION
    );
    sendPickList(captain);
    return false;
}

return {
    getPickTeam,
    getCaptain,
    isCurrentPickingCaptain,
    sendPickList,
    capPick
};

};