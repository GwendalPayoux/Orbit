const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdateService } = require('../desktop/updater.cjs');
const { updatePublishing } = require('../desktop/update-config.cjs');
function fixture(options = {}) {
  const updater = new EventEmitter();
  Object.assign(updater, { checkForUpdates: async () => updater.emit('update-available', { version: '0.4.0' }), downloadUpdate: async () => updater.emit('update-downloaded', { version: '0.4.0' }), quitAndInstall: () => {} });
  const notifications = [];
  const service = new UpdateService({ updater, currentVersion: '0.3.0', configured: true, isPackaged: true, notify: (...args) => notifications.push(args), ...options });
  return { service, updater, notifications };
}
test('unconfigured, development and unsupported installs never contact a server', async () => {
  for (const [option,phase] of [[{configured:false},'unconfigured'],[{isPackaged:false},'development'],[{supported:false},'unsupported']]) {
    const {service,updater} = fixture(option);
    updater.checkForUpdates = () => {throw Error('Must not check');};
    assert.equal((await service.check()).phase,phase);
    assert.equal((await service.download()).phase,phase);
    assert.equal((await service.install()).phase,phase);
    service.start();assert.equal(service.startTimer,undefined);service.dispose();
  }
});
test('available update notifies once and never downloads or installs automatically', async () => {
  const {service,updater,notifications} = fixture(); let downloads = 0, installs = 0;
  updater.downloadUpdate = async () => { downloads++; }; updater.quitAndInstall = () => installs++;
  assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(updater.allowDowngrade,false);
  await service.install(); await service.download(); assert.equal(downloads,0);assert.equal(installs,0);
  await service.check(); await service.check();assert.equal(service.snapshot().phase,'available');
  assert.deepEqual(notifications,[['available','0.4.0']]);assert.equal(downloads,0);service.dispose();
});
test('download progress, duplicate clicks and persistence before installation', async () => {
  let finish, downloads = 0, installs = 0; const order = [];
  const {service,updater} = fixture({beforeInstall:async()=>order.push('saved')});
  updater.downloadUpdate = () => {downloads++;return new Promise(resolve=>{finish=resolve;});};
  updater.quitAndInstall = (silent,relaunch) => {installs++;assert.equal(silent,false);assert.equal(relaunch,true);order.push('install');};
  await service.check();const pending=service.download();await service.download();assert.equal(downloads,1);
  updater.emit('download-progress',{percent:38.7});assert.equal(service.snapshot().progress,38.7);
  await service.install();assert.equal(installs,0);
  updater.emit('update-downloaded',{version:'0.4.0'});finish();await pending;
  await service.check();assert.equal(service.snapshot().phase,'downloaded');
  await Promise.all([service.install(),service.install()]);assert.equal(installs,1);assert.deepEqual(order,['saved','install']);service.dispose();
});
test('failed checksum cannot be installed and download can be retried', async () => {
  const {service,updater} = fixture(); let installs=0;
  updater.quitAndInstall=()=>installs++;
  updater.downloadUpdate=async()=>{const error=Object.assign(Error('sha512 checksum mismatch'),{code:'ERR_CHECKSUM_MISMATCH'});updater.emit('error',error);throw error;};
  await service.check();await service.download();assert.equal(service.snapshot().phase,'error');assert.equal(service.snapshot().retry,'download');assert.match(service.snapshot().error,/vérification/);
  await service.install();assert.equal(installs,0);
  updater.downloadUpdate=async()=>updater.emit('update-downloaded',{version:'0.4.0'});
  await service.download();assert.equal(service.snapshot().phase,'downloaded');service.dispose();
});
test('saving failure prevents installation; network failure can recover to current', async () => {
  const {service,updater} = fixture({beforeInstall:async()=>{throw Error('Disk full');}});let installs=0;
  updater.checkForUpdates=async()=>{throw Error('offline');};await service.check();assert.equal(service.snapshot().retry,'check');
  updater.checkForUpdates=async()=>updater.emit('update-not-available');await service.check();assert.equal(service.snapshot().phase,'current');
  updater.emit('update-downloaded',{version:'0.4.0'});updater.quitAndInstall=()=>installs++;
  await service.install();assert.equal(installs,0);assert.equal(service.snapshot().retry,'install');service.dispose();
});
test('release config disables missing feeds and rejects unsafe URLs', () => {
  assert.equal(updatePublishing().publish,null);
  const result=updatePublishing('https://updates.example.test/orbit');assert.equal(result.publish[0].url,'https://updates.example.test/orbit/');assert.equal(result.extraMetadata.orbitUpdates.configured,true);
  for(const url of ['http://updates.example.test','file:///tmp','https://user:password@example.test','https://example.test/?token=secret','https://example.test/#fragment','garbage']) assert.throws(()=>updatePublishing(url));
});
test('GitHub without a first complete release explains the missing publication',async()=>{
  const {service,updater}=fixture();updater.checkForUpdates=async()=>{throw Object.assign(Error('missing release'),{code:'ERR_UPDATER_NO_PUBLISHED_VERSIONS'});};await service.check();assert.match(service.snapshot().error,/Release publique/);service.dispose();
});
