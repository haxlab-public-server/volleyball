class DiscordBot {
    constructor({ replayWebhook, vipWebhook, logWebhook, reportWebhook, roomLabel }) {
        this.replayWebhook = replayWebhook;
        this.vipWebhook = vipWebhook;
        this.logWebhook = logWebhook;
        this.reportWebhook = reportWebhook;
        this.roomLabel = roomLabel;
    }

    sendRecording(rec, name, id) {
        if (this.replayWebhook) {
            fetch(this.replayWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `\`[${this.roomLabel}]\` № ${id}`,
                    username: "replay",
                }),
                headers: {
                    "Content-Type": "application/json",
                },
            }).then((res) => res);
            let form = new FormData();
            form.append(null, new File([rec], name, { type: "text/plain" }));
            form.append("payload_json", JSON.stringify({
                username: "replay",
            }));

            setTimeout(() => {
                fetch(this.replayWebhook, {
                    method: "POST",
                    body: form,
                }).then((res) => res);
            }, 500);
        }
    }

    sendVipPassword(vipPassword) {
        if (this.vipWebhook) {
            fetch(this.vipWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `# \`[${this.roomLabel}]\` 🌟VIP-Пароль: ${vipPassword}`,
                    username: "vip",
                }),
                headers: {
                    "Content-Type": "application/json",
                },
            }).then((res) => res);
        }
    }

    sendLog(content) {
        if (this.logWebhook) {
            fetch(this.logWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `\`[${this.roomLabel}]\` ${content}`,
                    username: "logs",
                }),
                headers: {
                    "Content-Type": "application/json",
                },
            }).then((res) => res);
        }
    }

    sendReport(adminName, toPlayerName, action, reason, time) {
        const actions = {
            "mute": "замутил",
            "ban": "забанил",
            "unmute": "размутил",
            "unban": "разбанил"
        };

        if (this.reportWebhook) {
            fetch(this.reportWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `## \`[${this.roomLabel}]\` 🔴 ${adminName} ${actions[action]} ${toPlayerName}${time != null ? ` на ${time}` : ""}${reason != null ? ` по причине: ${reason}` : ""}`,
                    username: "logs",
                }),
                headers: {
                    "Content-Type": "application/json",
                },
            }).then((res) => res);
        }
    }
}

module.exports = {
    DiscordBot
};