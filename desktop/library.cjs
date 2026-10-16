const within = (value, parent) => value === parent || value.startsWith(parent + '/');
function ensureCategory(state, value) {
  if (!value) return;
  const parts = value.split('/');
  for (let i = 1; i <= parts.length; i++) { const key = parts.slice(0,i).join('/'); if (!state.categories.includes(key)) state.categories.push(key); }
}
function categoryChange(state, action, original, replacement = '') {
  if (!['add','rename','delete'].includes(action)) throw Error('Action inconnue');
  const valid = key => typeof key === 'string' && key.length <= 240 && key.split('/').every(s => s.trim() && s.length <= 60);
  if (!valid(original) || action === 'rename' && !valid(replacement)) throw Error('Nom de rubrique invalide');
  state.categoryAliases ||= {};
  if (action === 'add') { if (state.categories.includes(original)) throw Error('Cette rubrique existe déjà'); ensureCategory(state,original); return; }
  if (!state.categories.includes(original)) throw Error('Rubrique introuvable');
  if (action === 'rename' && (within(replacement,original) && replacement !== original || state.categories.includes(replacement) && replacement !== original)) throw Error('Ce déplacement créerait un conflit de rubriques');
  const affected = state.categories.filter(c => within(c,original));
  const map = key => action === 'delete' ? '' : replacement + key.slice(original.length);
  const renamed = affected.map(map);
  if (action === 'rename' && renamed.some(c => state.categories.includes(c) && !affected.includes(c))) throw Error('Une sous-rubrique porte déjà ce nom');
  state.categories = state.categories.filter(c => !affected.includes(c));
  if (action === 'rename') for (const value of renamed) ensureCategory(state,value);
  for (const app of state.apps) if (app.category && within(app.category,original)) app.category = map(app.category);
  for (const [key,value] of Object.entries(state.categoryAliases)) if (value && within(value,original)) state.categoryAliases[key] = map(value);
  for (const key of affected) state.categoryAliases[key] = map(key);
}
function migrate(state) {
  state.routines ||= []; state.categories ||= []; state.apps ||= [];
  // Existing imported libraries have already completed an exploration.
  state.scannedOnce ??= state.apps.some(a => a.source === 'scan');
  if(!state.hierarchyVersion){ensureCategory(state,'Jeux/Launchers');state.hierarchyVersion=1;}
  for (const a of state.apps) if (a.category) ensureCategory(state,a.category);
  return state;
}
function saveRoutine(state, id, name, appIds, createId) {
  name = typeof name === 'string' ? name.trim().slice(0,80) : '';
  if (!name || !Array.isArray(appIds)) throw Error('Donnez un nom et sélectionnez des applications');
  const ids = [...new Set(appIds)];
  if (!ids.length || ids.length > 40 || ids.some(id => !state.apps.some(a => a.id === id))) throw Error('Sélectionnez entre 1 et 40 applications disponibles');
  const existing = id ? state.routines.find(r => r.id === id) : null;
  if (id && !existing) throw Error('Routine introuvable');
  if (existing) Object.assign(existing,{name,appIds:ids}); else state.routines.push({id:createId(),name,appIds:ids});
}
async function runRoutine(state, id, launch) {
  const routine = state.routines.find(r => r.id === id);
  if (!routine) throw Error('Routine introuvable');
  const results = await Promise.allSettled(routine.appIds.map(id => launch(id)));
  return { launched: results.filter(r => r.status === 'fulfilled').length, errors: results.flatMap((r,i) => r.status === 'rejected' ? [{name:state.apps.find(a => a.id === routine.appIds[i])?.name || 'Application retirée',message:r.reason.message}] : []) };
}
module.exports = { within, ensureCategory, categoryChange, migrate, saveRoutine, runRoutine };
