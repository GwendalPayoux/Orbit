function updatePublishing(rawUrl = '') {
  if (!rawUrl.trim()) return { publish: null, extraMetadata: { orbitUpdates: { configured: false } } };
  let url;
  try { url = new URL(rawUrl.trim()); } catch { throw Error('ORBIT_UPDATE_URL doit être une adresse HTTPS valide.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw Error('ORBIT_UPDATE_URL doit utiliser HTTPS, sans identifiants, paramètres ni fragment.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return { publish: [{ provider: 'generic', url: url.href }], extraMetadata: { orbitUpdates: { configured: true } } };
}
module.exports = { updatePublishing };
