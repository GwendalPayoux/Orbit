const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { NsisUpdater } = require('electron-updater');
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
const { UpdateService } = require('../desktop/updater.cjs');
// Use Node's loopback transport with the real updater's manifest parsing,
// semver selection, download pipeline, cache and SHA-512 verification.
// No installer is executable and quitAndInstall is never invoked.
class LoopbackExecutor extends ElectronHttpExecutor {
  createRequest(options, callback) {
    assert.equal(options.hostname, '127.0.0.1');
    return http.request(options, callback);
  }
  addRedirectHandlers() {}
}
async function scenario(t, {version='0.4.0', corrupt=false} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'orbit-update-test-'));
  const payload=Buffer.from('Orbit update fixture: not an executable.\n'.repeat(1500));
  const sha512=createHash('sha512').update(corrupt ? 'different content' : payload).digest('base64');
  const requests=[];
  const server=http.createServer((req,res)=>{
    requests.push(req.url);
    if(req.url.split('?')[0]==='/latest.yml') {res.setHeader('Content-Type','text/yaml');res.end(JSON.stringify({version,files:[{url:'fixture.exe',sha512,size:payload.length}],path:'fixture.exe',sha512,releaseDate:new Date().toISOString()}));}
    else if(req.url==='/fixture.exe') {res.setHeader('Content-Length',payload.length);res.end(payload);}
    else {res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const config=path.join(root,'app-update.yml');
  await fs.writeFile(config,JSON.stringify({provider:'generic',url:`http://127.0.0.1:${server.address().port}/`,updaterCacheDirName:'cache'}));
  const updater=new NsisUpdater(null,{
    version:'0.3.0',name:'OrbitTest',isPackaged:true,
    appUpdateConfigPath:config,userDataPath:root,baseCachePath:root,
    whenReady:async()=>{},onQuit:()=>{},quit:()=>{throw Error('Must not install');}
  });
  updater._testOnlyOptions={platform:'win32',isUseDifferentialDownload:false};
  updater.httpExecutor=new LoopbackExecutor();updater.logger=null;updater.disableDifferentialDownload=true;
  const service=new UpdateService({updater,currentVersion:'0.3.0',configured:true,isPackaged:true});
  t.after(async()=>{
    service.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('orbit-update-test-'));
    await fs.rm(root,{recursive:true,force:true});
  });
  return {service,updater,requests,payload};
}
test('real updater reads a feed and downloads only after request, with checksum verification', async t=>{
  const {service,updater,requests,payload}=await scenario(t);
  await service.check();assert.equal(service.snapshot().phase,'available');
  assert.equal(requests.some(url=>url==='/fixture.exe'),false);
  await service.download();assert.equal(service.snapshot().phase,'downloaded');
  assert.deepEqual(await fs.readFile(updater.installerPath),payload);
});
test('real updater rejects corrupted bytes and does not mark them ready to install', async t=>{
  const {service}=await scenario(t,{corrupt:true});await service.check();await service.download();
  assert.equal(service.snapshot().phase,'error');assert.equal(service.snapshot().retry,'download');assert.match(service.snapshot().error,/vérification/);
  await service.install();assert.equal(service.snapshot().phase,'error');
});
test('real updater never proposes an older release', async t=>{
  const {service}=await scenario(t,{version:'0.2.0'});await service.check();assert.equal(service.snapshot().phase,'current');
});
