const {
    findFirstNumberCharString
} = require('./utils')

function getRecordingName() {
    let d = new Date();
    let day = d.getDate() < 10 ? "0" + d.getDate() : d.getDate();
    let month = d.getMonth() < 10 ? "0" + (d.getMonth() + 1) : d.getMonth() + 1;
    let year =
        d.getFullYear() % 100 < 10
            ? "0" + (d.getFullYear() % 100)
            : d.getFullYear() % 100;
    let hour = d.getHours() < 10 ? "0" + d.getHours() : d.getHours();
    let minute = d.getMinutes() < 10 ? "0" + d.getMinutes() : d.getMinutes();
    return `${day}-${month}-${year}-${hour}h${minute}.hbr2`;
}

function getIdReplay() {
    var d = new Date();
    return `${d.getFullYear() % 100}${d.getMonth() < 9 ? "0" : ""}${
        d.getMonth() + 1
    }${d.getDate() < 10 ? "0" : ""}${d.getDate()}${
        d.getHours() < 10 ? "0" : ""
    }${d.getHours()}${d.getMinutes() < 10 ? "0" : ""}${d.getMinutes()}${
        d.getSeconds() < 10 ? "0" : ""
    }${d.getSeconds()}`;
}

function fetchRecording(game, discord) {
    discord.sendRecording(game.rec, getRecordingName(), getIdReplay())
}

module.exports = {
    getRecordingName,
    getIdReplay,
    fetchRecording
};