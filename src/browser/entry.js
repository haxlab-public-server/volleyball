/* Config build */
const {
    buildGameConfig
} = require('../core/roomConstants');

async function main() {

const lastIds = {} // "auth": [id, conn, auth]

const config = window.__roomConfig;
const {
    roomName,
    maxPlayers,
    Discord,
    Telegram,
    gamesTimeout,
    defaultTeamSize,
    maxInactivity,
    queueMatches,
    upTeamSizePlayers,
    vipSlots,
    GhostKick,
    vipQueueRoles,
    defaultMatchPoint,
    defaultTeamPickMode,
    defaultWinstay,
    joinAuths,
    mode,
    roomLabel,
    roomCategory,
    timeZone,
    vipUpCooldownMs
} = config;

const { createTimeFormat } = require('../core/utils/timeFormat');
const timeFormat = createTimeFormat(timeZone);

const room = HBInit(buildGameConfig(window.__secrets.token, config));

const cf = room.CollisionFlags;
const db = window.__db;

/*
 * Locale. window.__locale is set by src/index.js (Node side) as part of
 * the same page.evaluate payload as __roomConfig/__secrets — it's just
 * the locale code string (e.g. "ru"), not the dictionary itself, so
 * createLocale() re-resolves the actual translations from
 * src/core/locale/*.js, which esbuild bundles into this same page
 * script. To change language, set LOCALE in .env — nothing in this file
 * needs to change. To add a language, see src/core/locale/index.js.
 */
const { createLocale } = require('../core/locale');
const { t, stringToTime, getStringTime } = createLocale(window.__locale);

/* Models */
const {
    Role,
    RoleString,
    HaxNotification,
    Color,
    Team,
    Mods,
    TeamPickMode,
    TeamPickModeString,
    Sits,
    Serve,
    ServeString
} = require('../core/models/enums');

const createModels = require('../core/models/models');
const {
    Game,
    MuteList,
    createMutePlayer
} = createModels({
    room,
    db,
    Color,
    HaxNotification,
    t
});

const muteArray = new MuteList();
const MutePlayer = createMutePlayer(muteArray, room, Color, HaxNotification, t);

/* Utils */
const {
    getOnlyInt,
    getStatTime,
    getDate,
    findFirstNumberCharString,
    getRandomInt,
    getRandomFloat,
    getMinutesGame,
    getSecondsGame,
    getTimeGame,
} = require('../core/utils/utils');

const {
    DiscordBot
} = require('../core/utils/discord');

const {
    volleyball_map,
    noGoal_map
} = require('../core/maps');

/* State */
const state = {};

/* Settings */
state.roomPassword = window.__secrets.roomPassword;
room.setPassword(state.roomPassword != '' ? state.roomPassword : null);
state.matchPoint = defaultMatchPoint;
state.teamPickMode = defaultTeamPickMode;
state.winstay_mode = defaultWinstay;
state.teamSize = defaultTeamSize;
state.joinAuths = joinAuths;
state.mode = mode;

/* Utils */
state.lastTouches = [];
state.inactivityTicks = [];
state.queue = []
state.touches = 0
state.ball_color = 0xffffff
state.goal_sit = false
state.onGameStopTimeout;
state.training_interval;
state.scores = null;
state.saveBall = false
state.serveBall = false
state.waitingForServe = true;
state.newMatchPoint = 0
state.afkList = []
state.sit = Sits.NONE
state.captainAlertTimer = null;
state.captainPickTimer = null;
state.captainPickForTeam = null;
state.serve = null
state.serveType = Serve.POWER
state.training_mode = false
state.training_mode_spawn = []
state.roomLink;
state.game = new Game(defaultTeamSize);
state.vipPassword = getRandomInt(100000, 999999)
state.vipUpBooking = null;
state.vipUpCooldownUntil = 0;
state.pickSize = null;
state.pickUsedVipUpFor = null;
state.winstay = {
  streak: 0,
  team: [],
}

const discordBot = new DiscordBot({ db, roomLabel });

/* Room Utils */
const createRoomUtils = require('../core/utils/roomUtils');
const {
    getAuth,
    getConn,
    getID,
    getTeamArray
} = createRoomUtils({
    room,
    state,
    lastIds,
    Team
})

const createSitState = require('../core/services/sitState');
const { transitionTo } = createSitState({
    state,
    Sits
});

const {
    getRecordingName: getRecordingNameRaw,
    getIdReplay: getIdReplayRaw,
    fetchRecording: fetchRecordingRaw
} = require('../core/utils/reports');

const getRecordingName = () => getRecordingNameRaw(timeFormat);
const getIdReplay = () => getIdReplayRaw(timeFormat);
const fetchRecording = (game, discord) => fetchRecordingRaw(game, discord, timeFormat);

const createRoleHelpers = require('../core/utils/roles');
const {
    checkRoles,
    setRole,
    getRole,
    getChatColor
} = createRoleHelpers({
    room,
    db,
    getAuth,
    getID,
    Role,
    RoleString,
    Color,
    HaxNotification,
    discordBot,
    t
})

/* Services */
const createAccountsHelpers = require('../core/services/accounts');
const {
    formatAccountView,
    resolveTargetAuth
} = createAccountsHelpers({
    room,
    getAuth,
    discordBot,
    getDate,
    timeFormat,
    t
})

const createCaptainsHelpers = require('../core/services/captains');
const {
    getPickTeam,
    getCaptain,
    isCurrentPickingCaptain,
    sendPickList,
    capPick,
    clearCaptainPickTimer
} = createCaptainsHelpers({
    room,
    state,
    getTeamArray,
    Team,
    Color,
    HaxNotification,
    t
})

const createUpdatesUtils = require('../core/services/updates');
const {
    updateTeamSize,
    updateTeams,
    startPickingTeams,
    startCaptains,
    continueCaptainPick,
    updateVipSlots,
    updateBallColor
} = createUpdatesUtils({
    room,
    state,
    getTeamArray,
    getAuth,
    getRole,
    getRandomInt,
    Mods,
    Team,
    Role,
    Color,
    HaxNotification,
    defaultTeamSize,
    upTeamSizePlayers,
    queueMatches,
    vipQueueRoles,
    maxPlayers,
    vipSlots,
    Sits,
    transitionTo,
    TeamPickMode,
    getPickTeam,
    getCaptain,
    sendPickList,
    clearCaptainPickTimer,
    t
})

const createTrainingService = require('../core/services/training');
const {
    ballSpawner,
    startBallSpawn,
    stopBallSpawn,
    startTrainingMode,
    stopTrainingMode
} = createTrainingService({
    room,
    state,
    volleyball_map,
    noGoal_map,
    cf,
    Team,
    getRandomFloat
})

const createIntervals = require('../core/services/intervals');
const createAnalyticsService = require('../core/services/analytics');
const analytics = createAnalyticsService({
    room,
    state,
    db,
    roomLabel,
    roomCategory,
    Team,
    timeFormat
});

createIntervals({
    room,
    state,
    cf,
    db,
    muteArray,
    lastIds,
    getRandomInt,
    discordBot,
    getTeamArray,
    checkRoles,
    updateTeams,
    maxInactivity,
    Team,
    Mods,
    Color,
    HaxNotification,
    updateVipSlots,
    updateBallColor,
    Sits,
    Discord,
    Telegram,
    roomName,
    maxPlayers,
    analytics,
    timeFormat,
    t
})

const createChatHelpers = require('../core/services/chat');
const {
    getCommand,
    sendAnnouncementTeam
} = createChatHelpers({ 
    room,
    getCommands: () => commands
})

/* Default game settings */
room.setTeamColors(1, 0, 0xFFDAA3, [0xFF4D17])
room.setTeamColors(2, 0, 0xFFDAA3, [0x0873FF])
room.setCustomStadium(volleyball_map)
room.setScoreLimit(0);
room.setTimeLimit(0);
room.setTeamsLock(true);

/* Player commands */
const createPlayerCommands = require('../core/commands/player');
const {
    teamChatCommand,
    helpCommand,
    admCommand,
    serveCommand,
    trySilentServe,
    bbCommand,
    statsCommand,
    renameCommand,
    topsCommand,
    getAuthCommand,
    queueCommand,
    discordCommand,
    discordUnlinkCommand,
    telegramCommand,
    afkCommand,
    afkListCommand,
    idsCommand,
    deanonCommand,
    myPointCommand,
    accountCommand
} = createPlayerCommands({
    room,
    state,
    db,
    getAuth,
    getRole,
    getTeamArray,
    sendAnnouncementTeam,
    getStatTime,
    updateTeams,
    updateTeamSize,
    getCommands: () => commands,
    Role,
    Mods,
    Team,
    Color,
    ServeString,
    HaxNotification,
    Discord,
    Telegram,
    vipQueueRoles,
    Sits,
    getPickTeam,
    getCaptain,
    sendPickList,
    defaultTeamSize,
    discordBot,
    formatAccountView,
    resolveTargetAuth,
    t
})

/* VIP commands */
const createVipCommands = require('../core/commands/vip');
const {
    chatColorCommand,
    trainingSettingCommands,
    trainingCommand,
    upCommand
} = createVipCommands({
    room,
    state,
    db,
    getAuth,
    startBallSpawn,
    stopBallSpawn,
    startTrainingMode,
    stopTrainingMode,
    Mods,
    Color,
    HaxNotification,
    vipUpCooldownMs,
    t
})

/* Admin commands */
const createAdminCommands = require('../core/commands/admin');
const {
    unBanCommand,
    banCommand,
    banListCommand,
    muteCommand,
    unMuteCommand,
    muteListCommand
} = createAdminCommands({
    room,
    lastIds,
    muteArray,
    getAuth,
    getConn,
    getRole,
    getOnlyInt,
    stringToTime,
    getStringTime,
    MutePlayer,
    Role,
    Color,
    HaxNotification,
    Discord,
    db,
    discordBot,
    t
})

/* Master commands */
const createMasterCommands = require('../core/commands/master');
const {
    passwordCommand,
    addAuthCommand,
    deleteAuthCommand,
    clearAuthsCommand,
    joinAuthsCommand,
    modeCommand,
    statsResetCommand,
    matchPointCommand,
    teamSizeCommand,
    setRoleCommand,
    getRoleListCommand,
    winstayCommand,
    teamPickCommand
} = createMasterCommands({
    room,
    state,
    db,
    getAuth,
    getRole,
    setRole,
    stringToTime,
    getStringTime,
    stopTrainingMode,
    Role,
    RoleString,
    Mods,
    Color,
    HaxNotification,
    defaultTeamSize,
    TeamPickModeString,
    discordBot,
    formatAccountView,
    t
})

/* Commands init */
const createCommands = require('../core/commands/commands');
const commands = createCommands({
    Role,
    helpCommand,
    bbCommand,
    statsCommand,
    renameCommand,
    topsCommand,
    afkCommand,
    afkListCommand,
    idsCommand,
    serveCommand,
    discordCommand,
    discordUnlinkCommand,
    telegramCommand,
    queueCommand,
    admCommand,
    deanonCommand,
    banCommand,
    unBanCommand,
    banListCommand,
    muteCommand,
    unMuteCommand,
    muteListCommand,
    setRoleCommand,
    getRoleListCommand,
    matchPointCommand,
    teamSizeCommand,
    getAuthCommand,
    passwordCommand,
    addAuthCommand,
    deleteAuthCommand,
    clearAuthsCommand,
    joinAuthsCommand,
    modeCommand,
    statsResetCommand,
    trainingCommand,
    trainingSettingCommands,
    myPointCommand,
    chatColorCommand,
    winstayCommand,
    teamPickCommand,
    upCommand,
    accountCommand
})

/* EVENTS */
const wrapEventHandlers = require('../core/safeEventHandlers');

/* Movement events */
const createMovementEvents = require('../core/events/movement');
Object.assign(room, wrapEventHandlers(createMovementEvents({
    room,
    state,
    lastIds,
    db,
    getAuth,
    getConn,
    getRole,
    updateVipSlots,
    updateTeams,
    updateTeamSize,
    stopTrainingMode,
    GhostKick,
    Role,
    Team,
    Mods,
    Color,
    HaxNotification,
    Discord,
    Telegram,
    maxPlayers,
    discordBot,
    Sits,
    getPickTeam,
    getCaptain,
    sendPickList,
    analytics,
    t
})));

/* Activity events */
const createActivityEvents = require('../core/events/activity');
Object.assign(room, wrapEventHandlers(createActivityEvents({
    room,
    state,
    cf,
    db,
    muteArray,
    getAuth,
    getRole,
    getCommand,
    commands,
    getTeamArray,
    sendAnnouncementTeam,
    getChatColor,
    teamChatCommand,
    trySilentServe,
    defaultTeamSize,
    Role,
    Team,
    Mods,
    Color,
    ServeString,
    HaxNotification,
    discordBot,
    updateBallColor,
    Sits,
    isCurrentPickingCaptain,
    capPick,
    continueCaptainPick,
    t
})));

/* Game events */
const createGameEvents = require('../core/events/game');
Object.assign(room, wrapEventHandlers(createGameEvents({
    room,
    state,
    db,
    getAuth,
    getTeamArray,
    sendAnnouncementTeam,
    getTimeGame,
    ballSpawner,
    startPickingTeams,
    fetchRecording,
    discordBot,
    getIdReplay,
    Game,
    noGoal_map,
    volleyball_map,
    gamesTimeout,
    Discord,
    Team,
    Mods,
    Color,
    HaxNotification,
    transitionTo,
    Sits,
    defaultTeamSize,
    analytics,
    t
})));

/* Misc events */
const createMiscEvents = require('../core/events/misc');
Object.assign(room, wrapEventHandlers(createMiscEvents({
    room,
    getRole,
    roomName,
    state,
    discordBot,
    timeFormat,
    t
})));

/*
 * Reverse bridge: Node calls this directly via page.evaluate(...) when an
 * action was issued from a Discord slash-command and needs an immediate
 * live effect in this room, on top of whatever was already written to
 * the DB / browser-side state by the Node side before this is called.
 * No page.exposeFunction registration is needed for this direction:
 * Puppeteer's page.evaluate can always reach into the page's global
 * scope from Node, so exposing window.__applyModeration here is enough.
 */
window.__applyModeration = function (action) {
    try {
        if (action.type === 'password') {
            state.roomPassword = action.value ?? '';
            room.setPassword(action.value || null);
            return true;
        }

        const online = room.getPlayerList().find(p => getAuth(p.id) === action.auth);

        if (action.type === 'roleUpdate') {
            discordBot.syncRole(action.auth);
            if (!online) return false;
            
            const issuedRoleValue = RoleString[action.roleName];
            if (issuedRoleValue >= Role.PREADMIN) {
                room.setPlayerAdmin(online.id, true);
            } else {
                room.setPlayerAdmin(online.id, false);
            }

            room.sendAnnouncement(
                t('role.liveUpdateNotice', { roleName: action.roleName }),
                online.id,
                Color.WH_BLUE,
                'bold',
                HaxNotification.MENTION
            );
        }

        if (action.type === 'ban') {
            if (!online) return false;

            const timeStr = action.timeStr ? t('ban.timeSuffix', { time: action.timeStr }) : ''
            const reasonStr = action.reason ? t('ban.reasonSuffix', { reason: action.reason }) : ''

            room.kickPlayer(
                online.id,
                t('ban.kickMessageLive', { admin: action.name ?? t('role.names.admin'), time: timeStr, reason: reasonStr, discord: Discord }),
                true
            );

            room.sendAnnouncement(
                t('ban.announceLive', { admin: action.name ?? t('role.names.admin'), target: online.name, time: timeStr, reason: reasonStr }),
                null,
                Color.RED,
                'bold',
                HaxNotification.MENTION
            );
            return true;
        }

        if (action.type === 'unban') {
            const banId = action.unban_id ?? lastIds[action.auth]?.[0];
            if (banId != null) {
                room.clearBan(banId);
                return true;
            }
            return false;
        }

        if (action.type === 'mute') {
            if (!online) return false;

            const muteObj = new MutePlayer(online.name, online.id, action.auth);
            muteObj.id = action.muteId ?? MutePlayer.incrementId();
            muteObj.unmuteDate = action.unmuteDate;
            muteArray.list.push(muteObj);

            const timeStr = action.timeStr ? t('mute.timeSuffix', { time: action.timeStr }) : ''
            const reasonStr = action.reason ? t('mute.reasonSuffix', { reason: action.reason }) : ''

            room.sendAnnouncement(
                t('mute.success', { admin: action.name ?? t('role.names.admin'), target: online.name, time: timeStr, reason: reasonStr }),
                null,
                Color.RED,
                'bold',
                HaxNotification.MENTION
            );
            return true;
        }

        if (action.type === 'unmute') {
            const muteObj = muteArray.getByAuth(action.auth);
            if (muteObj) {
                muteArray.list = muteArray.list.filter(m => m.id !== muteObj.id);
                if (online) {
                    room.sendAnnouncement(
                        t('mute.canSpeak'),
                        online.id,
                        Color.GR_GREEN,
                        'bold',
                        HaxNotification.CHAT
                    );
                }
            }
            return muteObj != null;
        }

        return false;
    } catch (err) {
        console.error('[__applyModeration] failed:', err);
        return false;
    }
};

return { commands };

};

const ready = main().catch((err) => {
    console.error('[FATAL] entry.js failed to initialise:', err);
    return err;
});
module.exports = { ready };