module.exports = function createRoleHelpers({
    room,
    db,
    getAuth,
    getID,
    Role,
    RoleString,
    Color,
    HaxNotification
}) {

function checkRoles() {
    const expiredAuths = db.expireRoles();
    for (const auth of expiredAuths) {
        const id = getID(auth);
        if (id != null) {
            room.setPlayerAdmin(id, false);
            room.sendAnnouncement(
                `Срок вашей роли истёк =(`,
                id,
                Color.WH_BLUE,
                "bold",
                HaxNotification.MENTION
            );
        }
    }
}

function setRole(player, role, time, auth = null) {
    if (auth == null) {
        player.auth = getAuth(player.id);
    } else {
        player.auth = auth;
        player.admin = false;
    }
    db.setRole(player.auth, role, time);
    if (RoleString[role] >= Role.PREADMIN) {
        if (player.id == undefined) {
            player.id = getID(player.auth);
        }
        if (player.id != null) {
            room.setPlayerAdmin(player.id, true);
        }
    } else {
        if (player.id == undefined) {
            player.id = getID(player.auth);
        }
        if (player.id != null) {
            room.setPlayerAdmin(player.id, false);
        }
    }
}
    
function getRole(player, auth = null) {
    if (auth == null) {
        player.auth = getAuth(player.id);
    } else {
        player.auth = auth;
        player.admin = false;
    }
    const account = db.getAccount(player.auth);
    if (!account || account.role == null) {
        return Role.PLAYER;
    }
    return RoleString[account.role] ?? Role.PLAYER;
}

function getChatColor(player) {
    if (getRole(player) >= Role.VIP) {
        const account = db.getAccount(getAuth(player.id));
        const color = account && account.chat_color != null ? account.chat_color : null;
        if (color != null) {
            return `0x${color}`;
        } else {
            return null;
        }
    } else {
        return null;
    }
}

return {
    checkRoles,
    setRole,
    getRole,
    getChatColor
}

};