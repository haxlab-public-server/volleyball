const Role = { 
    PLAYER: 0, 
    VIP: 1, 
    PREADMIN: 2, 
    ADMIN: 3,  
    MASTER: 4
};

const RoleString = {
    "player": Role.PLAYER,
    "vip": Role.VIP,
    "preadmin": Role.PREADMIN,
    "admin": Role.ADMIN,
    "master": Role.MASTER,
};

const HaxNotification = { 
    NONE: 0, 
    CHAT: 1, 
    MENTION: 2 
};

const Color = {
    GREY: 0x808080, 
    GR_GREEN: 0x658a69, 
    RED: 0xe62c2c, 
    GR_RED: 0xa80000, 
    TEAM_RED: 0xff6363, 
    TEAM_BLUE: 0x63c3ff, 
    WH_BLUE: 0xa2c0e6, 
    WH_GREEN: 0xbdef53, 
    PINK: 0xff24ff
}

const Team = {
    SPECTATORS: 0, 
    RED: 1, 
    BLUE: 2 
};

const Mods = {
    PUBLIC: 0, 
    PRIVATE: 1
} 

const TeamPickMode = {
    RANDOM: 0,
    CAPTAINS: 1,
};

const TeamPickModeString = {
    random: TeamPickMode.RANDOM,
    captains: TeamPickMode.CAPTAINS,
};

const Sits = {
    NONE: 0,
    GAME: 1,
    RANDOMIZE: 2,
    CHOICE: 3,
    TIMEOUT: 4,
    FORMING: 5
}

module.exports = {
    Role,
    RoleString,
    HaxNotification,
    Color,
    Team,
    Mods,
    TeamPickMode,
    TeamPickModeString,
    Sits
}