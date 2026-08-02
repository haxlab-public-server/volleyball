module.exports = function createRoleHelpers({
    room,
    fs,
    getAuth,
    getID,
    Role,
    RoleString,
    Color,
    HaxNotification
}) {

function checkRoles() {
    // TODO: migrate from fs to sqlite in the future
    var accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf8'));
    var keys = Object.keys(accounts)
    for (var i of keys) {
        if (accounts[i]["date"] != null && accounts[i]["date"] <= Date.now()) {
            accounts[i]["role"] = "player"
            accounts[i]["date"] = null
            var id = getID(i)
            if (id != null) {
                room.setPlayerAdmin(id, false)
                room.sendAnnouncement(
                    `Срок вашей роли истёк =(`,
                    id,
                    Color.WH_BLUE,
                    "bold",
                    HaxNotification.MENTION
                )
            }
        }
    }
    // TODO: migrate from fs to sqlite in the future
    fs.writeFileSync("accounts.json", JSON.stringify(accounts))
}

function setRole(player, role, time, auth = null) {
    if (auth == null) {
        player.auth = getAuth(player.id)
    } else {
        player.auth = auth
        player.admin = false
    }
    // TODO: migrate from fs to sqlite in the future
    var accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf8'));
    accounts[player.auth]["role"] = role
    accounts[player.auth]["date"] = time
    // TODO: migrate from fs to sqlite in the future
    fs.writeFileSync("accounts.json", JSON.stringify(accounts))
    if (RoleString[accounts[player.auth]["role"]] >= Role.PREADMIN) {
        if (player.id == undefined) {
            player.id = getID(player.auth)
        }
        if (player.id != null) {
            room.setPlayerAdmin(player.id, true)
        }
    } else {
        if (player.id == undefined) {
            player.id = getID(player.auth)
        }
        if (player.id != null) {
            room.setPlayerAdmin(player.id, false)
        }
    }
}
    
function getRole(player, auth = null) {
    if (auth == null) {
        player.auth = getAuth(player.id)
    } else {
        player.auth = auth
        player.admin = false
    }
    // TODO: migrate from fs to sqlite in the future
    var accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf8'));
    var account = accounts[player.auth];
    if (!account || account.role == null) {
        return Role.PLAYER;
    }
    return RoleString[account.role] ?? Role.PLAYER;
}

function getChatColor(player) {
    if (getRole(player) >= Role.VIP) {
        // TODO: migrate from fs to sqlite in the future
        var accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf8'));
        var account = accounts[getAuth(player.id)];
        var color = account && account.chat_color != null ? account.chat_color : null;
        if (color != null) {
            return `0x${color}`
        } else {
            return null
        }
    } else {
        return null
    }
}

return {
    checkRoles,
    setRole,
    getRole,
    getChatColor
}

};