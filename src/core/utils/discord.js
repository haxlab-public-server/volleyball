class DiscordBot {
    constructor({ replayWebhook, vipWebhook, logWebhook, reportWebhook, roomLabel }) {
        this.replayWebhook = replayWebhook;
        this.vipWebhook = vipWebhook;
        this.logWebhook = logWebhook;
        this.reportWebhook = reportWebhook;
        this.roomLabel = roomLabel;
    }

    async _safeFetch(url, options, type = "log") {
        try {
            const res = await fetch(url, options);
            if (!res.ok) {
                console.log(`[Discord Webhook Error] Тип: ${type} | Статус: ${res.status} ${res.statusText}`);
            }
        } catch (err) {
            console.log(`[Discord Network Error] Ошибка отправки ${type}: Сбой сети или неверный URL.`);
        }
    }

    sendRecording(rec, name, id) {
        if (this.replayWebhook) {
            this._safeFetch(this.replayWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `\`[${this.roomLabel}]\` № ${id}`,
                    username: "replay",
                }),
                headers: { "Content-Type": "application/json" },
            }, "replay_info");

            let form = new FormData();
            form.append(null, new File([rec], name, { type: "text/plain" }));
            form.append("payload_json", JSON.stringify({ username: "replay" }));

            setTimeout(() => {
                this._safeFetch(this.replayWebhook, {
                    method: "POST",
                    body: form,
                }, "replay_file");
            }, 500);
        }
    }

    sendVipPassword(vipPassword) {
        if (this.vipWebhook) {
            this._safeFetch(this.vipWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `# \`[${this.roomLabel}]\` 🌟VIP-Пароль: ${vipPassword}`,
                    username: "vip",
                }),
                headers: { "Content-Type": "application/json" },
            }, "vip");
        }
    }

    sendLog(content) {
        if (this.logWebhook) {
            this._safeFetch(this.logWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `\`[${this.roomLabel}]\` ${content}`,
                    username: "logs",
                }),
                headers: { "Content-Type": "application/json" },
            }, "logs");
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
            this._safeFetch(this.reportWebhook, {
                method: "POST",
                body: JSON.stringify({
                    content: `## \`[${this.roomLabel}]\` 🔴 ${adminName} ${actions[action]} ${toPlayerName}${time != null ? ` на ${time}` : ""}${reason != null ? ` по причине: ${reason}` : ""}`,
                    username: "logs",
                }),
                headers: { "Content-Type": "application/json" },
            }, "report");
        }
    }
}

module.exports = {
    DiscordBot
};