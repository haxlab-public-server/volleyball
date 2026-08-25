module.exports = function createModels({
    room,
    db,
    Color,
    HaxNotification,
    t
}) {
class Game {
    constructor(teamSize) {
        this.rec = room.startRecording();
        this.teamSize = teamSize
    }
}

class MuteList {
    constructor() {
        this.list = [];
    }

    async init() {
        this.list = await db.getMutes();
        return this;
    }

    async add(mutePlayer) {
        this.list.push(mutePlayer);
        await db.addMute(mutePlayer);
        return mutePlayer;
    }

    getById(id) {
        var index = this.list.findIndex((mutePlayer) => mutePlayer.id === id);
        if (index !== -1) {
            return this.list[index];
        }
        return null;
    }

    getByPlayerId(id) {
        var index = this.list.findIndex(
            (mutePlayer) => mutePlayer.playerId === id
        );
        if (index !== -1) {
            return this.list[index];
        }
        return null;
    }

    getByAuth(auth) {
        var index = this.list.findIndex(
            (mutePlayer) => mutePlayer.auth === auth
        );
        if (index !== -1) {
            return this.list[index];
        }
        return null;
    }

    async removeById(id) {
        var index = this.list.findIndex((mutePlayer) => mutePlayer.id === id);
        if (index !== -1) {
            this.list.splice(index, 1);
        }
        await db.removeMuteById(id);
    }

    async removeByAuth(auth) {
        var index = this.list.findIndex(
            (mutePlayer) => mutePlayer.auth === auth
        );
        if (index !== -1) {
            this.list.splice(index, 1);
        }
        await db.removeMuteByAuth(auth);
    }

    async checkMutes() {
        const now = Date.now();
        for (var i = this.list.length - 1; i >= 0; i--) { 
            var player = this.list[i];
            if (now > player.unmuteDate) { 
                room.sendAnnouncement( 
                    t('mute.noLongerMuted', { name: player.name }),
                    null, 
                    Color.WH_BLUE, 
                    "bold", 
                    HaxNotification.CHAT 
                ); 
                player.unmuteDate = null; 
                await this.removeById(player.id); 
            } 
        } 
    }

    async updateMutes() {
        this.list = await db.getMutes();
    }
}

function createMutePlayer(muteArray, room, Color, HaxNotification, t) {
    return class MutePlayer {
        constructor(name, id, auth) {
            this.id = MutePlayer.incrementId();
            this.name = name;
            this.playerId = id;
            this.auth = auth;
            this.unmuteDate = null;
        }

        static incrementId() {
            if (!this.latestId) this.latestId = 1;
            else this.latestId++;
            return this.latestId;
        }

        async setDuration(time) {
            this.unmuteDate = Date.now() + time;
            await muteArray.add(this);
        }

        async remove() {
            room.sendAnnouncement(
                t('mute.canSpeak'),
                this.playerId,
                Color.GR_GREEN,
                "bold",
                HaxNotification.CHAT
            );
            this.unmuteDate = null;
            await muteArray.removeById(this.id);
        }
    };
}

return {
    Game,
    MuteList,
    createMutePlayer
}

};