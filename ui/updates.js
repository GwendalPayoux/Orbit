(() => {
  const bridge = window.orbit;
  let status = { phase: 'preview', currentVersion: 'Aperçu web', availableVersion: null, progress: 0 };
  const openButton = document.createElement('button');
  openButton.id = 'update-open'; openButton.type = 'button'; openButton.textContent = '↻ Mises à jour';
  document.querySelector('.header-actions').prepend(openButton);
  const banner = document.createElement('section');
  banner.id = 'update-banner'; banner.hidden = true; banner.setAttribute('aria-label', 'Mise à jour d’Orbit');
  banner.innerHTML = '<div><strong id="update-banner-title"></strong><p id="update-banner-message" role="status" aria-live="polite"></p></div><button class="primary" id="update-banner-action" type="button"></button><button id="update-details" type="button">Détails</button>';
  document.querySelector('.heading').before(banner);
  const modal = document.createElement('dialog');
  modal.id = 'update-dialog';
  modal.innerHTML = '<div class="dialog-heading"><h2>Mises à jour d’Orbit</h2><button id="update-close" type="button" aria-label="Fermer">×</button></div><p id="update-installed" class="muted"></p><h3 id="update-title"></h3><p id="update-message" role="status" aria-live="polite"></p><progress id="update-progress" max="100" aria-label="Téléchargement de la mise à jour" hidden></progress><p id="update-last-check" class="muted"></p><p id="update-restart-note" class="muted" hidden>Orbit va se fermer pour installer la mise à jour, puis redémarrer. Votre bibliothèque et vos sessions seront enregistrées.</p><div class="dialog-actions"><button id="update-check" type="button">Vérifier maintenant</button><button id="update-action" class="primary" type="button" hidden></button></div>';
  document.body.append(modal);
  const el = id => document.getElementById(id);
  function actionFor(s) {
    if (s.phase === 'available') return { method: 'downloadUpdate', label: 'Télécharger la mise à jour' };
    if (s.phase === 'downloaded') return { method: 'installUpdate', label: 'Redémarrer et installer' };
    if (s.phase === 'error') return { method: ({ check:'checkUpdates', download:'downloadUpdate', install:'installUpdate' })[s.retry] || 'checkUpdates', label: 'Réessayer' };
    return null;
  }
  function render(next) {
    status = next;
    const version = status.availableVersion || '';
    const percent = Math.round(Number(status.progress) || 0);
    const messages = {
      preview: ['Aperçu de l’interface', 'La vérification et l’installation sont disponibles dans l’application de bureau.'],
      development: ['Mode développement', 'Les mises à jour sont disponibles dans la version installée d’Orbit.'],
      unconfigured: ['Service de mise à jour non configuré', 'Les mises à jour seront disponibles une fois le service de distribution activé.'],
      unsupported: ['Format non compatible', 'Utilisez la version AppImage installée pour recevoir les mises à jour sous Linux.'],
      idle: ['Rechercher une nouvelle version', 'Orbit vérifie les mises à jour au démarrage, puis toutes les six heures.'],
      checking: ['Recherche en cours…', 'Orbit vérifie si une nouvelle version est disponible.'],
      current: ['Orbit est à jour', 'Vous utilisez la dernière version disponible sur le service de mise à jour.'],
      available: [`Orbit ${version} est disponible`, 'Téléchargez la nouvelle version directement depuis le launcher.'],
      downloading: ['Téléchargement en cours…', `${percent} % téléchargés. Vous pouvez continuer à utiliser Orbit.`],
      downloaded: [`Orbit ${version} est prêt à être installé`, 'Redémarrez Orbit lorsque vous êtes prêt.'],
      installing: ['Préparation de l’installation…', 'Enregistrement de votre bibliothèque avant le redémarrage.'],
      error: ['Mise à jour interrompue', status.error || 'Réessayez plus tard.']
    };
    const [title, message] = messages[status.phase] || messages.idle;
    el('update-installed').textContent = `Version actuelle : ${status.currentVersion}`;
    el('update-title').textContent = title; el('update-message').textContent = message;
    el('update-banner-title').textContent = title; el('update-banner-message').textContent = message;
    banner.hidden = !['available','downloading','downloaded','installing','error'].includes(status.phase);
    openButton.classList.toggle('has-update', ['available','downloaded'].includes(status.phase));
    openButton.setAttribute('aria-label', ['available','downloaded'].includes(status.phase) ? title + '. Ouvrir les mises à jour' : 'Ouvrir les mises à jour d’Orbit');
    el('update-progress').hidden = status.phase !== 'downloading'; el('update-progress').value = percent;
    el('update-last-check').textContent = status.lastChecked ? `Dernière vérification : ${new Date(status.lastChecked).toLocaleString('fr-FR')}` : '';
    el('update-restart-note').hidden = !(status.phase === 'downloaded' || status.phase === 'error' && status.retry === 'install');
    el('update-check').disabled = ['preview','development','unconfigured','unsupported','checking','downloading','downloaded','installing'].includes(status.phase);
    const action = actionFor(status);
    for (const button of [el('update-action'), el('update-banner-action')]) {
      button.hidden = !action; button.disabled = !action; button.textContent = action?.label || '';
    }
  }
  function open() { if (!modal.open) modal.showModal(); }
  async function perform(method) {
    if (!bridge?.[method]) return;
    el('update-check').disabled = true; el('update-action').disabled = true; el('update-banner-action').disabled = true;
    try { const result = await bridge[method](); if (result) render(result); }
    catch { render({ ...status, phase: 'error', error: 'Impossible de contacter le service de mise à jour. Réessayez plus tard.', retry: method === 'downloadUpdate' ? 'download' : method === 'installUpdate' ? 'install' : 'check' }); }
  }
  openButton.onclick = el('update-details').onclick = open;
  el('update-close').onclick = () => modal.close();
  el('update-check').onclick = () => perform('checkUpdates');
  el('update-action').onclick = () => { const action = actionFor(status); if (action) void perform(action.method); };
  // Installation always opens the explanatory panel before the explicit restart click.
  el('update-banner-action').onclick = () => { if (status.phase === 'downloaded' || status.retry === 'install') open(); else { const action = actionFor(status); if (action) void perform(action.method); } };
  render(status);
  if (bridge?.onUpdateStatus) bridge.onUpdateStatus(render);
  if (bridge?.onOpenUpdates) bridge.onOpenUpdates(open);
  if (bridge?.updateStatus) bridge.updateStatus().then(render).catch(() => {});
})();
