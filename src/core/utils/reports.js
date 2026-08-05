const {
    findFirstNumberCharString
} = require('./utils')

const {
    roomName
} = require('../roomConstants')

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
    }${d.getSeconds()}${findFirstNumberCharString(roomName)}`;
}

function fetchRecording(replayWebhook, game) {
    if (replayWebhook != null && replayWebhook != "") {
        fetch(replayWebhook, {
            method: "POST",
            body: JSON.stringify({
                content: `№ ${getIdReplay()}`,
                username: "replay",
            }),
            headers: {
                "Content-Type": "application/json",
            },
        }).then((res) => res);
        let form = new FormData();
        form.append(
            null,
            new File([game.rec], getRecordingName(), { type: "text/plain" })
        );
        form.append(
            "payload_json",
            JSON.stringify({
                username: "replay",
            })
        );
        setTimeout(() => {
            fetch(replayWebhook, {
                method: "POST",
                body: form,
            }).then((res) => res);
        }, 500)
    }
}

module.exports = {
    getRecordingName,
    getIdReplay,
    fetchRecording
};