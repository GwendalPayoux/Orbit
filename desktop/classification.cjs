// Conservative, offline rules. Unknown applications stay visible and unassigned.
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const {ensureCategory}=require('./library.cjs');
const {principalInfo,selectPrincipals}=require('./principals.cjs');
function classify(candidate) {
  const name = normalize(candidate.name);
  const executable = normalize(candidate.executable || candidate.target).replace(/\\/g, '/');
  const text = normalize([candidate.name, candidate.productName, candidate.description, candidate.bundleId].join(' '));
  const categories = new Set((candidate.desktopCategories || '').split(';'));
  const result = (type, category, hidden, reason, confidence = 'high') => ({ type, category, hidden, classification: { reason, confidence, ruleVersion: 1 } });
  const principal=principalInfo(candidate);
  if(principal?.primary)return result('software','Jeux/Launchers',false,'Lanceur principal reconnu');
  if (/\.(txt|pdf|chm|hlp|html?|rtf|md)(?:\s|$)/.test(executable) || /^(?:instruction booklet|changelog|copying|license(?:\.txt)?|aide de .+|manuel de .+|quelles sont les nouveautes.*|rechercher les mises a jour|a propos de java|configurer java|journal de telemetrie.*|preferences linguistiques d.office|pc health check|卸载.*)$/i.test(name))
    return result('software', '', true, 'Document annexe, aide, configuration ou diagnostic');
  if (/^(computer|ordinateur|file explorer|explorateur de fichiers|run|executer|speech recognition|reconnaissance vocale|math input panel|enregistrement utilisateur)(?: \(\d+\))?$/.test(name))
    return result('software', '', true, 'Raccourci de fonction Windows préinstallée');
  // Technical shortcut names take precedence even inside a game directory.
  if(candidate.discoverySource==='disk'&&/(?:helper|service|crash|subprocess|webengine|errorreporter|redist)/i.test(candidate.target.split(/[\\/]/).pop()))
    return result('software','',true,'Processus auxiliaire trouvé sur un disque');
  if(candidate.discoverySource==='disk'&&(/(?:setup|installer|installation wizard)/i.test(candidate.description||'')||/(?:setup|installer)\d*\.exe$/i.test(candidate.target)))
    return result('software','',true,'Installateur trouvé sur un disque');
  if(candidate.discoverySource==='disk' && /(?:^|[\s_\-])(setup|installer|helper|service|updater|crash\w*|cef\w*|redist\w*|dxsetup|unitycrashhandler\w*|unins\w*)(?:$|[\s_\-\d])/.test(normalize(candidate.target.split(/[\\/]/).pop().replace(/\.exe$/i,''))))
    return result('software','',true,'Composant technique trouvé sur un disque');
  if (/\b(uninstall\w*|desinstall\w*|unins\d*|updater|crash reporter|crashreporter|crash handler|maintenance tool|redistributable|repair|reparer|readme|release notes|documentation|aide et support)\b/.test(name) || /\/(unins\d*|uninstall|crashreporter|vc_redist[^/]*)\.(exe|app)$/.test(executable))
    return result('software', '', true, 'Raccourci de maintenance, documentation ou composant technique');
  if ((/\/(windows\/)?(system32|syswow64)\//.test(executable) && !/\b(paint|notepad|bloc.notes|calculatrice|calculator|terminal)\b/.test(name)) || /^(control panel|panneau de configuration|services|registry editor|editeur du registre|event viewer|observateur d.evenements|task scheduler|planificateur de taches|windows powershell(?: ise)?|command prompt|invite de commandes|windows tools|outils windows|system information|informations systeme|disk cleanup|nettoyage de disque|device manager|gestionnaire de peripheriques|system settings|reglages systeme)(?:\s|$)/.test(name) || executable.startsWith('/system/applications/utilities/'))
    return result('software', '', true, 'Outil système ou administration préinstallé');
  // A store/launcher remains software even when it mentions games.
  if (/\b(steam|epic games launcher|gog galaxy|ubisoft connect|ea app|battle\.net|riot client|client riot|xbox|rockstar games launcher|curseforge|overwolf|thunderstore mod manager|r2modman)\b/.test(name))
    return result('software', 'Jeux/Launchers', false, 'Plateforme de jeux reconnue');
  if (categories.has('Game') || /\/(steamapps\/common|gog games|epic games)\//.test(executable) || /\b(stardew valley|hollow knight|minecraft|baldur.s gate|cyberpunk 2077|elden ring|fortnite|league of legends|valorant|rocket league|counter.strike|the sims|les sims|red dead redemption|genshin impact|overwatch|electro air hockey)\b/.test(text))
    return result('game', 'Jeux', false, categories.has('Game') ? 'Catégorie Game du fichier .desktop' : 'Jeu reconnu par son nom ou son dossier');
  if (/\b(visual studio|vs code|vscode|jetbrains|intellij|pycharm|webstorm|rider|android studio|docker|postman|sublime text|notepad\+\+|unity|unreal engine|godot|gitkraken|mysql (shell|workbench))\b/.test(text) || categories.has('Development'))
    return result('software', 'Développement', false, 'Outil de développement reconnu');
  if (/\b(blender|figma|photoshop|illustrator|indesign|lightroom|premiere|after effects|davinci resolve|affinity|inkscape|gimp|krita|audacity|ableton|fl studio|autocad|solidworks|fusion 360|sketchup|obs studio|adobe creative cloud|waveform|windows movie maker)\b/.test(text) || ['Graphics','AudioVideo','Audio','Video'].some(c => categories.has(c)))
    return result('software', 'Création', false, 'Outil de création ou métadonnées multimédia');
  if (/\b(microsoft (word|excel|powerpoint|outlook|teams)|libreoffice|onlyoffice|slack|zoom|notion|obsidian|acrobat|onenote|thunderbird|skype entreprise)\b/.test(text) || /^(word|excel|powerpoint|outlook|access|publisher)(?:\s\d{4})?$/.test(name) || categories.has('Office'))
    return result('software', 'Travail', false, 'Outil bureautique ou professionnel reconnu');
  if (/\b(firefox|chrome|chromium|microsoft edge|brave|opera|vivaldi|safari|internet explorer|filezilla|discord)\b/.test(text) || categories.has('WebBrowser'))
    return result('software', 'Internet', false, 'Navigateur reconnu');
  return result(candidate.type === 'game' ? 'game' : 'software', '', candidate.discoverySource==='disk', candidate.discoverySource==='disk'?'Exécutable trouvé sur un disque : application principale à vérifier':'Application non reconnue : classement à vérifier', 'low');
}
function mergeScan(state, candidates, createId) {
  state.categoryAliases ||= {};
  let added = 0, hidden = 0;
  for (const candidate of selectPrincipals(candidates)) {
    const pathKey=p=>process.platform==='win32'?String(p||'').toLowerCase():String(p||'');
    let existing = state.apps.find(a => pathKey(a.target) === pathKey(candidate.target) || candidate.executable && !candidate.arguments && !a.arguments && pathKey(a.executable)===pathKey(candidate.executable));
    const prediction = classify(candidate);
    const category = Object.hasOwn(state.categoryAliases, prediction.category) ? state.categoryAliases[prediction.category] : prediction.category;
    if (category) ensureCategory(state,category);
    if (!existing) {
      existing = { ...candidate, ...prediction, category, id: createId(), version: candidate.version || '', seconds: 0, favorite: false, source: 'scan', overrides: {} };
      state.apps.push(existing); added++;
    } else {
      // Keep old user customizations; previous versions had no override flags.
      const overrides = existing.overrides || { type: existing.type === 'game', category: Boolean(existing.category), hidden: existing.hidden === false };
      existing.overrides = overrides;
      existing.classification = prediction.classification;
      for (const key of ['type','category','hidden']) if (!overrides[key]) existing[key] = key === 'category' ? category : prediction[key];
      for (const key of ['executable','processExecutable','trackingUnsupported','description','productName','desktopCategories','bundleId','arguments','iconName','alternateTargets','available']) if (candidate[key] !== undefined && candidate[key] !== null) existing[key] = candidate[key];
      if (!existing.version && candidate.version) existing.version = candidate.version;
      existing.source ||= 'scan';
    }
    if (existing.hidden) hidden++;
  }
  return { added, hidden };
}
module.exports = { classify, mergeScan };
