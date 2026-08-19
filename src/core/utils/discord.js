class DiscordBot {
    constructor({ db, roomLabel }) {
        this.db = db;
        this.roomLabel = roomLabel;
    }

    _bridge() {
        return typeof window !== 'undefined' ? window.__discord : null;
    }

    async confirmLink(code, auth) {
        const bridge = this._bridge();
        if (!bridge) return { ok: false, reason: 'unavailable' };
        try {
            return await bridge.consumeLinkCode(code, auth);
        } catch (err) {
            console.error('[Discord] confirmLink failed:', err);
            return { ok: false, reason: 'unavailable' };
        }
    }

    async unlink(auth) {
        const bridge = this._bridge();
        if (!bridge) return { ok: false, reason: 'unavailable' };
        try {
            return await bridge.unlinkByAuth(auth);
        } catch (err) {
            console.error('[Discord] unlink failed:', err);
            return { ok: false, reason: 'unavailable' };
        }
    }

    syncRole(auth) {
        const bridge = this._bridge();
        if (!bridge) return;
        bridge.syncRoleForAuth(auth).catch(err => console.error('[Discord] syncRole failed:', err));
    }

    sendLog(content) {
        const bridge = this._bridge();
        if (!bridge) return;
        bridge.sendLog(this.roomLabel, content).catch(err => console.error('[Discord] sendLog failed:', err));
    }

    sendReport(adminName, toPlayerName, action, reason, time) {
        const bridge = this._bridge();
        if (!bridge) return;
        bridge.sendReport(this.roomLabel, adminName, toPlayerName, action, reason, time)
            .catch(err => console.error('[Discord] sendReport failed:', err));
    }

    sendRecording(rec, name, id) {
        const bridge = this._bridge();
        if (!bridge) return;
        bridge.sendRecording(this.roomLabel, rec, name, id).catch(err => console.error('[Discord] sendRecording failed:', err));
    }

    sendVipPassword(vipPassword) {
        const bridge = this._bridge();
        if (!bridge) return;
        bridge.sendVipPassword(this.roomLabel, vipPassword).catch(err => console.error('[Discord] sendVipPassword failed:', err));
    }

    /*
     * filePath is a path on the Node-side filesystem, produced by
     * db.backupStats() and threaded back into the browser context only as
     * an opaque string — the browser never reads or interprets it, it's
     * just forwarded to the bridge so Node can read the file itself.
     */
    sendStatsBackup(filePath, filename) {
        const bridge = this._bridge();
        if (!bridge) return;
        bridge.sendStatsBackup(this.roomLabel, filePath, filename).catch(err => console.error('[Discord] sendStatsBackup failed:', err));
    }

    updateOnlineMessage(content) {
        const bridge = this._bridge();
        if (!bridge) return;
        bridge.updateOnlineMessage(content).catch(err => console.error('[Discord] updateOnlineMessage failed:', err));
    }
}

module.exports = {
    DiscordBot
};