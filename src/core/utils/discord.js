class DiscordBot {
    constructor({replayWebhook, vipWebhook, logWebhook, reportWebhook}) {
        this.replayWebhook = replayWebhook;
        this.vipWebhook = vipWebhook;
        this.logWebhook = logWebhook;
        this.reportWebhook = reportWebhook
    }

    sendRecording(rec, name, id) {
        if (this.replayWebhook != null && this.replayWebhook != "") {
            fetch(this.replayWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `№ ${id}`,
                    username: "replay",
                }),
                headers: {
                    "Content-Type": "application/json",
                },
            }).then((res) => res);
            let form = new FormData();
            form.append(
                null,
                new File([rec], name, { type: "text/plain" })
            );
            form.append(
                "payload_json",
                JSON.stringify({
                    username: "replay",
                })
            );
            setTimeout(() => {
                fetch(this.replayWebhook, {
                    method: "POST",
                    body: form,
                }).then((res) => res);
            }, 500)
        }
    }

    sendVipPassword(vipPassword) {
        if (this.vipWebhook != null && this.vipWebhook != "") {
            fetch(this.vipWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `# 🌟VIP-Пароль: ${vipPassword}`,
                    username: "vip",
                }),
                headers: {
                    "Content-Type": "application/json",
                },
            }).then((res) => res);
        }
    }
    
    sendLog(content) {
        if (this.logWebhook != null && this.logWebhook != "") {
            fetch(this.logWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `${content}`,
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
        }
        if (this.reportWebhook != null && this.reportWebhook!= "") {
            fetch(this.reportWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `## 🔴 ${adminName} ${actions[action]} ${toPlayerName} ${time != null ? `на ${time}` : ""} ${reason != null ? `по причине: ${reason}` : ""}`,
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
}