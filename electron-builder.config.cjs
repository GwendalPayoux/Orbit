const { updatePublishing } = require('./desktop/update-config.cjs');
module.exports = {
  ...require('./package.json').build,
  ...(process.env.ORBIT_UPDATE_URL ? updatePublishing(process.env.ORBIT_UPDATE_URL) : {
    publish: [{ provider: 'github', owner: 'GwendalPayoux', repo: 'Orbit', releaseType: 'draft' }],
    extraMetadata: { orbitUpdates: { configured: true } }
  })
};
