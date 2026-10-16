const { EventEmitter } = require('node:events');

// Native updater is injected so lifecycle and error handling can be tested safely.
class UpdateService extends EventEmitter {
  constructor({ updater, currentVersion, configured, isPackaged, supported = true, beforeInstall = async () => {}, notify = () => {} }) {
    super();
    Object.assign(this, { updater, beforeInstall, notify });
    this.notified = new Set(); this.listeners = [];
    this.status = {
      phase: !isPackaged ? 'development' : !configured ? 'unconfigured' : !supported ? 'unsupported' : 'idle',
      currentVersion, availableVersion: null, progress: 0, lastChecked: null, error: null, retry: null
    };
    if (!this.enabled()) return;
    updater.autoDownload = false; updater.autoInstallOnAppQuit = false;
    updater.autoRunAppAfterInstall = true; updater.disableWebInstaller = true;
    updater.allowPrerelease = false; updater.allowDowngrade = false;
    const listen = (name, handler) => { updater.on(name, handler); this.listeners.push([name, handler]); };
    listen('checking-for-update', () => this.set({ phase: 'checking', error: null, retry: null }));
    listen('update-available', info => {
      this.set({ phase: 'available', availableVersion: info.version, progress: 0, lastChecked: Date.now(), error: null });
      if (!this.notified.has(info.version)) {
        this.notified.add(info.version);
        try { this.notify('available', info.version); } catch { /* In-app banner remains available. */ }
      }
    });
    listen('update-not-available', () => this.set({ phase: 'current', availableVersion: null, lastChecked: Date.now(), error: null }));
    listen('download-progress', info => this.set({ phase: 'downloading', progress: Math.max(0, Math.min(100, Number(info.percent) || 0)) }));
    listen('update-downloaded', info => {
      this.set({ phase: 'downloaded', availableVersion: info.version, progress: 100, error: null, retry: null });
      try { this.notify('downloaded', info.version); } catch { /* Notification support varies by OS. */ }
    });
    listen('error', error => this.fail(error));
    listen('update-cancelled', () => this.set({ phase: this.status.availableVersion ? 'available' : 'idle', progress: 0, error: null }));
  }
  enabled() { return !['unconfigured','development','unsupported'].includes(this.status.phase); }
  snapshot() { return { ...this.status }; }
  set(patch) { Object.assign(this.status, patch); this.emit('state', this.snapshot()); }
  fail(error, retry) {
    if (this.status.phase === 'error' && !retry) return;
    const action = retry || (this.status.phase === 'downloading' ? 'download' : this.status.phase === 'installing' ? 'install' : 'check');
    const code=String(error?.code||'');
    const signature = /SIGNATURE|CHECKSUM|SHA512|INVALID_UPDATE_FILE/.test(code) || /checksum|sha512|signature/i.test(error?.message || '');
    if(/NO_PUBLISHED_VERSIONS|LATEST_VERSION_NOT_FOUND|CHANNEL_FILE_NOT_FOUND/.test(code)){
      this.set({phase:'error',error:'Aucune Release publique complète n’est accessible pour le moment. Réessayez après la première publication sur GitHub.',retry:'check'});return;
    }
    const message = signature ? 'La vérification de la mise à jour a échoué. Le fichier ne sera pas installé.'
      : action === 'install' ? 'L’installation n’a pas pu démarrer. Réessayez après avoir fermé les autres fenêtres d’Orbit.'
      : 'Impossible de récupérer la mise à jour. Vérifiez votre connexion ou réessayez plus tard.';
    this.set({ phase: 'error', error: message, retry: action });
  }
  async check() {
    if (!this.enabled() || ['checking','downloading','downloaded','installing'].includes(this.status.phase)) return this.snapshot();
    this.set({ phase: 'checking', error: null, retry: null });
    try { await this.updater.checkForUpdates(); } catch (error) { this.fail(error, 'check'); }
    return this.snapshot();
  }
  async download() {
    if (!this.enabled() || !(this.status.phase === 'available' || this.status.phase === 'error' && this.status.retry === 'download')) return this.snapshot();
    this.set({ phase: 'downloading', progress: 0, error: null, retry: null });
    try { await this.updater.downloadUpdate(); } catch (error) { this.fail(error, 'download'); }
    return this.snapshot();
  }
  async install() {
    if (!this.enabled() || !(this.status.phase === 'downloaded' || this.status.phase === 'error' && this.status.retry === 'install')) return this.snapshot();
    this.set({ phase: 'installing', error: null, retry: null });
    try {
      await this.beforeInstall();
      this.updater.quitAndInstall(false, true);
    } catch (error) { this.fail(error, 'install'); }
    return this.snapshot();
  }
  start() {
    if (!this.enabled() || this.startTimer) return;
    this.startTimer = setTimeout(() => { void this.check(); }, 15000);
    this.interval = setInterval(() => { if (['idle','current','error'].includes(this.status.phase)) void this.check(); }, 6 * 60 * 60 * 1000);
    this.startTimer.unref?.(); this.interval.unref?.();
  }
  dispose() {
    clearTimeout(this.startTimer); clearInterval(this.interval);
    for (const [name, handler] of this.listeners) this.updater.removeListener(name, handler);
  }
}
module.exports = { UpdateService };
