const { app, BrowserWindow, ipcMain, dialog, shell, Notification, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { discover, parseDesktop } = require('./discovery.cjs');
const { mergeScan } = require('./classification.cjs');
const { migrate, categoryChange, saveRoutine, runRoutine } = require('./library.cjs');
const { listProcesses, executableOf, UsageTracker } = require('./processes.cjs');
const { applicationIcon } = require('./icons.cjs');
const { UpdateService } = require('./updater.cjs');
const {consolidateLibrary,hasName}=require('./principals.cjs');
// Isolated development smoke tests never touch the user's real library.
if(!app.isPackaged&&process.env.ORBIT_TEST_USER_DATA)app.setPath('userData',process.env.ORBIT_TEST_USER_DATA);
let win, state, updates, scanAbort, pollTimer;
let queue=Promise.resolve(), quitting=false, pollBusy=false;
const tracker=new UsageTracker(), icons=new Map(), notifications=new Set();
const file=()=>path.join(app.getPath('userData'),'library.json');
async function save(){await fs.writeFile(file()+'.tmp',JSON.stringify(state,null,2));await fs.rename(file()+'.tmp',file());}
function enqueue(fn){const result=queue.then(fn);queue=result.catch(()=>{});return result;}
function send(channel,data){if(win&&!win.isDestroyed())win.webContents.send(channel,data);}
function handle(channel,fn,serialized=true){
  ipcMain.handle(channel,(event,...args)=>{
    if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Accès refusé');
    if((updates?.status.phase==='installing'||quitting)&&!channel.startsWith('updates:'))throw Error('Orbit prépare son redémarrage');
    return serialized?enqueue(()=>fn(...args)):fn(...args);
  });
}
function item(id){const a=state.apps.find(a=>a.id===id);if(!a)throw Error('Application introuvable');return a;}
function cleanLibrary(){consolidateLibrary(state);const ids=new Set(state.apps.map(a=>a.id));for(const key of tracker.sessions.keys())if(!ids.has(key))tracker.sessions.delete(key);for(const key of tracker.pending.keys())if(!ids.has(key))tracker.pending.delete(key);for(const key of tracker.paused)if(!ids.has(key))tracker.paused.delete(key);}
function snapshot(){return {...state,running:[...tracker.sessions.keys()],pending:[...tracker.pending.keys()],paused:[...tracker.paused]};}
async function prepare(a){
  if(process.platform==='darwin'&&a.target.endsWith('.app')&&!a.executable){
    try{const {execFile}=require('node:child_process');const {promisify}=require('node:util');const {stdout}=await promisify(execFile)('/usr/bin/plutil',['-convert','json','-o','-',path.join(a.target,'Contents/Info.plist')]);const m=JSON.parse(stdout);if(m.CFBundleExecutable)a.executable=path.join(a.target,'Contents/MacOS',m.CFBundleExecutable);}catch{}
  }
  if(process.platform==='win32'&&a.target.toLowerCase().endsWith('.lnk')){
    try{const link=shell.readShortcutLink(a.target);a.executable=link.target;a.arguments=link.args;}catch{}
  }
  if(process.platform==='linux'&&a.target.endsWith('.desktop')&&!a.executable){const parsed=parseDesktop(await fs.readFile(a.target,'utf8').catch(()=>''));if(parsed)Object.assign(a,parsed);}
  let executable=executableOf(a);
  if(process.platform!=='win32'&&executable){
    if(!path.isAbsolute(executable))for(const root of (process.env.PATH||'').split(path.delimiter)){const candidate=path.join(root,executable);if(await fs.access(candidate).then(()=>true,()=>false)){executable=candidate;break;}}
    try{a.processExecutable=await fs.realpath(executable);}catch{}
  }
  const base=executable.replace(/\\/g,'/').split('/').pop()?.toLowerCase();
  a.trackingUnsupported=!executable||['flatpak','snap','gio','cmd.exe','powershell.exe','rundll32.exe'].includes(base)||base==='steam.exe'&&/applaunch/i.test(a.arguments||'')||base==='steam'&&/applaunch/.test(a.executable||'');
  a.available=await fs.access(process.platform==='win32'&&a.executable?a.executable:a.target).then(()=>true,()=>false);
}
async function launch(id){
  const a=item(id);if(tracker.sessions.has(id)||tracker.pending.has(id))return;
  if(process.platform==='linux'&&a.target.endsWith('.desktop')){
    await new Promise((resolve,reject)=>{const child=spawn('gio',['launch',a.target],{stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Lancement impossible avec gio')));});
  }else if(process.platform==='linux'&&/\.appimage$/i.test(a.target)){
    if(!((await fs.stat(a.target)).mode&0o111))throw Error('Autorisez l’exécution de ce fichier AppImage dans ses propriétés.');
    await new Promise((resolve,reject)=>{const child=spawn(a.target,[],{detached:true,stdio:'ignore'});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
  }else{const error=await shell.openPath(a.target);if(error)throw Error(error);}
  if(!a.trackingUnsupported)tracker.expect(id);a.lastUsed=Date.now();
}
async function poll(){
  if(pollBusy||quitting||updates?.status.phase==='installing')return;pollBusy=true;
  try{
    const processes=await listProcesses();
    await enqueue(async()=>{
      if(quitting||updates?.status.phase==='installing')return;
      tracker.reconcile(state.apps,processes);
      send('usage:state',{running:[...tracker.sessions.keys()],pending:[...tracker.pending.keys()],paused:[...tracker.paused],apps:state.apps.map(a=>({id:a.id,seconds:a.seconds,lastUsed:a.lastUsed}))});
      if(Date.now()-(poll.lastSave||0)>15000){await save();poll.lastSave=Date.now();}
    });
  }catch{send('usage:error','Le suivi des processus est momentanément indisponible.');}finally{pollBusy=false;}
}
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
  app.setAppUserModelId('com.orbit.launcher');
  try{state=JSON.parse(await fs.readFile(file(),'utf8'));}
  catch(error){if(error.code!=='ENOENT'){dialog.showErrorBox('Bibliothèque illisible','Le fichier library.json a été conservé.');app.quit();return;}state={apps:[],categories:['Création','Travail'],theme:'system'};}
  migrate(state);await Promise.all(state.apps.filter(a=>hasName(a.name)).map(prepare));mergeScan(state,state.apps.filter(a=>a.source==='scan'),randomUUID);cleanLibrary();await save();
  handle('library',()=>snapshot());
  handle('scan',async()=>{
    if(scanAbort)throw Error('Une exploration est déjà en cours');
    const controller=new AbortController();scanAbort=controller;
    try{
      const found=await discover({allDisks:true,signal:controller.signal,exclude:[app.getAppPath(),app.getPath('userData')],onProgress:p=>send('scan:progress',p)});
      await Promise.all(found.map(prepare));
      if(controller.signal.aborted||quitting)throw Error('Exploration annulée');
      return await enqueue(async()=>{
        if(controller.signal.aborted||quitting||updates?.status.phase==='installing')throw Error('Exploration annulée');
        const summary=mergeScan(state,found,randomUUID);cleanLibrary();state.scannedOnce=true;state.lastScan=found.scanSummary;icons.clear();await save();
        return {state:snapshot(),...summary,scanSummary:found.scanSummary};
      });
    }catch(error){if(controller.signal.aborted)throw Error('Exploration annulée');throw error;}finally{scanAbort=null;}
  },false);
  handle('scanCancel',()=>{scanAbort?.abort();return true;},false);
  handle('icon',async id=>{const a=item(id);if(!icons.has(id))icons.set(id,applicationIcon(a,app,nativeImage).catch(()=>null));return icons.get(id);},false);
  handle('add',async()=>{
    const result=await dialog.showOpenDialog(win,{title:'Choisir une application',properties:['openFile'],filters:process.platform==='win32'?[{name:'Applications',extensions:['exe','lnk']}]:[]});
    if(result.canceled)return snapshot();
    return enqueue(async()=>{
      if(quitting||updates?.status.phase==='installing')throw Error('Orbit prépare son redémarrage');
      const target=result.filePaths[0];if(!state.apps.some(a=>a.target===target)){const a={id:randomUUID(),target,name:path.basename(target).replace(/\.(exe|lnk|app|desktop|appimage)$/i,''),type:'software',category:'',version:'',seconds:0,favorite:false,hidden:false,source:'manual',overrides:{type:true,category:true,hidden:true}};await prepare(a);state.apps.push(a);}await save();return snapshot();
    });
  },false);
  handle('update',async(id,changes)=>{
    const a=item(id);a.overrides||={};
    for(const key of ['type','category','hidden'])if(Object.hasOwn(changes,key))a.overrides[key]=true;
    if(typeof changes.hidden==='boolean')a.hidden=changes.hidden;
    if(typeof changes.name==='string'){if(!hasName(changes.name))throw Error('Donnez un nom à l’application');a.name=changes.name.trim().slice(0,120);a.overrides.name=true;}
    if(['game','software'].includes(changes.type))a.type=changes.type;
    if(typeof changes.version==='string')a.version=changes.version.slice(0,80);
    if(changes.category===''||state.categories.includes(changes.category))a.category=changes.category;
    if(typeof changes.favorite==='boolean')a.favorite=changes.favorite;
    await save();return snapshot();
  });
  handle('remove',async id=>{tracker.sessions.delete(id);tracker.pending.delete(id);tracker.paused.delete(id);icons.delete(id);state.apps=state.apps.filter(a=>a.id!==id);for(const r of state.routines)r.appIds=r.appIds.filter(a=>a!==id);await save();return snapshot();});
  handle('categories',async(action,name,replacement)=>{categoryChange(state,action,name,replacement);await save();return snapshot();});
  handle('routines:save',async(id,name,ids)=>{saveRoutine(state,id,name,ids,randomUUID);await save();return snapshot();});
  handle('routines:delete',async id=>{state.routines=state.routines.filter(r=>r.id!==id);await save();return snapshot();});
  handle('routines:run',async id=>{const result=await runRoutine(state,id,launch);await save();return {state:snapshot(),...result};});
  handle('theme',async theme=>{if(['light','dark','system'].includes(theme))state.theme=theme;await save();return snapshot();});
  handle('launch',async id=>{await launch(id);await save();return snapshot();});
  updates=new UpdateService({
    updater:require('electron-updater').autoUpdater,currentVersion:app.getVersion(),isPackaged:app.isPackaged,
    configured:require('../package.json').orbitUpdates?.configured===true,supported:process.platform!=='linux'||Boolean(process.env.APPIMAGE),
    beforeInstall:()=>{scanAbort?.abort();return enqueue(async()=>{tracker.checkpoint(state.apps);await save();});},
    notify:(kind,version)=>{
      if(!Notification.isSupported())return;
      const n=new Notification({title:'Mise à jour d’Orbit',body:kind==='available'?`Orbit ${version} est disponible. Ouvrez Orbit pour le télécharger.`:`Orbit ${version} est prêt à être installé.`});notifications.add(n);
      n.on('click',()=>{if(!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();send('updates:open');}});n.on('close',()=>notifications.delete(n));n.show();
    }
  });
  handle('updates:status',()=>updates.snapshot(),false);handle('updates:check',()=>updates.check(),false);handle('updates:download',()=>updates.download(),false);handle('updates:install',()=>updates.install(),false);
  win=new BrowserWindow({show:!(!app.isPackaged&&process.env.ORBIT_TEST_USER_DATA),width:1320,height:880,minWidth:820,minHeight:600,backgroundColor:'#101214',title:'Orbit',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());updates.on('state',s=>send('updates:state',s));
  await win.loadFile(path.join(__dirname,'../ui/index.html'));updates.start();void poll();pollTimer=setInterval(()=>void poll(),3000);pollTimer.unref();
  app.on('activate',()=>win.show());app.on('second-instance',()=>{if(win.isMinimized())win.restore();win.show();win.focus();});
});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>{updates?.dispose();clearInterval(pollTimer);});
app.on('before-quit',event=>{
  if(quitting||!state)return;event.preventDefault();quitting=true;scanAbort?.abort();clearInterval(pollTimer);
  enqueue(async()=>{tracker.checkpoint(state.apps);await save();}).then(()=>app.quit(),()=>{quitting=false;dialog.showErrorBox('Enregistrement impossible','Orbit reste ouvert pour conserver votre bibliothèque. Vérifiez l’espace disque.');pollTimer=setInterval(()=>void poll(),3000);});
});
