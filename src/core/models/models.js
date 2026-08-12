module.exports = function createModels({
    room,
    db,
    Color,
    HaxNotification
}) {

class Game {
    constructor(teamSize) {
        this.rec = room.startRecording();
        this.teamSize = teamSize
    }
}

class MuteList {
    constructor() {
        this.list = db.getMutes();
    }

    add(mutePlayer) {
        this.list.push(mutePlayer);
        db.addMute(mutePlayer);
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

    removeById(id) {
        var index = this.list.findIndex((mutePlayer) => mutePlayer.id === id);
        if (index !== -1) {
            this.list.splice(index, 1);
        }
        db.removeMuteById(id);
    }

    removeByAuth(auth) {
        var index = this.list.findIndex(
            (mutePlayer) => mutePlayer.auth === auth
        );
        if (index !== -1) {
            this.list.splice(index, 1);
        }
        db.removeMuteByAuth(auth);
    }

    checkMutes() {
        for (var i of this.list) {
            if (Date.now() > i.unmuteDate) {
                room.sendAnnouncement(
                    `${i.name} больше не в муте`,
                    null,
                    Color.WH_BLUE,
                    "bold",
                    HaxNotification.CHAT
                );
                i.unmuteDate = null;
                this.removeById(i.id);
            }
        }
    }

    updateMutes() {
        this.list = db.getMutes();
    }
}

function createMutePlayer(muteArray, room, Color, HaxNotification) {
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

        setDuration(time) {
            this.unmuteDate = Date.now() + time;
            muteArray.add(this);
        }

        remove() {
            room.sendAnnouncement(
                `Теперь ты можешь говорить.`,
                this.playerId,
                Color.GR_GREEN,
                "bold",
                HaxNotification.CHAT
            );
            this.unmuteDate = null;
            muteArray.removeById(this.id);
        }
    };
}

return {
    Game,
    MuteList,
    createMutePlayer
}

};