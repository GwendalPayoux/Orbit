// Check the public Release with the real updater; never install or restart.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const https=require('node:https');
const assert=require('node:assert/strict');
const {NsisUpdater}=require('electron-updater');
const {ElectronHttpExecutor}=require('electron-updater/out/electronHttpExecutor');
const {UpdateService}=require('../desktop/updater.cjs');
class PublicExecutor extends ElectronHttpExecutor{
  createRequest(options,callback){
    assert.equal(options.protocol,'https:');
    assert.ok(['github.com','api.github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(options.hostname));
    return https.request(options,callback);
  }
  addRedirectHandlers(){}
}
(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-public-feed-'));let service;
  try{
    const config=path.join(root,'app-update.yml');
    await fs.writeFile(config,JSON.stringify({provider:'github',owner:'GwendalPayoux',repo:'Orbit',updaterCacheDirName:'cache'}));
    const updater=new NsisUpdater(null,{version:'0.4.0',name:'OrbitFeedTest',isPackaged:true,appUpdateConfigPath:config,userDataPath:root,baseCachePath:root,whenReady:async()=>{},quit:()=>{throw Error('Must not install');},onQuit:()=>{}});
    updater._testOnlyOptions={platform:'win32',isUseDifferentialDownload:false};updater.httpExecutor=new PublicExecutor();updater.logger=null;
    service=new UpdateService({updater,currentVersion:'0.4.0',configured:true,isPackaged:true});
    await service.check();const result=service.snapshot();assert.equal(result.phase,'available',result.error||result.phase);assert.equal(result.availableVersion,require('../package.json').version);
    console.log(JSON.stringify({provider:'github',installedVersion:'0.4.0',availableVersion:result.availableVersion,publicFeedVerified:true}));
  }finally{service?.dispose();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
