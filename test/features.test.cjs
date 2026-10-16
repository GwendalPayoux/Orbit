const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const {spawn}=require('node:child_process');
const {migrate,categoryChange,saveRoutine,runRoutine}=require('../desktop/library.cjs');
const {scanVolumes,volumeRoots}=require('../desktop/volumes.cjs');
const {UsageTracker,matches,listProcesses,executableOf}=require('../desktop/processes.cjs');
const {classify,mergeScan}=require('../desktop/classification.cjs');
test('nested category rename and delete cascade without removing apps or resurrecting categories',()=>{
  const s=migrate({apps:[{id:'a',category:'Création/3D/Blender'}],categories:['Création','Création/3D','Création/3D/Blender'],routines:[]});
  categoryChange(s,'rename','Création/3D','Travail/3D');assert.equal(s.apps[0].category,'Travail/3D/Blender');assert.ok(s.categories.includes('Travail'));
  assert.throws(()=>categoryChange(s,'rename','Travail','Travail/3D/Loop'));
  categoryChange(s,'delete','Travail');assert.equal(s.apps.length,1);assert.equal(s.apps[0].category,'');
  categoryChange(s,'delete','Jeux');migrate(s);assert.ok(!s.categories.includes('Jeux'));
  mergeScan(s,[{name:'Steam',target:'steam.exe'}],()=> 'steam');assert.equal(s.apps[1].category,'');
});
test('known game platforms go to the launcher subcategory and games stay games',()=>{
  for(const name of ['Steam','Epic Games Launcher','GOG Galaxy','Battle.net','Client Riot','Ubisoft Connect','Rockstar Games Launcher']){const c=classify({name});assert.equal(c.category,'Jeux/Launchers',name);assert.equal(c.type,'software');}
  assert.equal(classify({name:'Hollow Knight'}).category,'Jeux');
  assert.equal(classify({name:'Unknown',target:'D:/portable/random.exe',discoverySource:'disk'}).hidden,true);
  assert.equal(classify({name:'Blender',description:'Blender Installer',target:'D:/downloads/blender.exe',discoverySource:'disk'}).hidden,true);
});
test('routine validation deduplicates apps, edits and reports independent launch failures',async()=>{
  const s={apps:[{id:'a',name:'Editor'},{id:'b',name:'Game'}],routines:[]};saveRoutine(s,'','Travail',['a','a','b'],()=> 'r');assert.deepEqual(s.routines[0].appIds,['a','b']);
  assert.throws(()=>saveRoutine(s,'','Invalid',['missing'],()=> 'bad'));
  const result=await runRoutine(s,'r',async id=>{if(id==='b')throw Error('Not installed');});assert.equal(result.launched,1);assert.deepEqual(result.errors,[{name:'Game',message:'Not installed'}]);
  saveRoutine(s,'r','Création',['a'],()=> 'unused');assert.equal(s.routines.length,1);assert.equal(s.routines[0].name,'Création');
});
test('scanner traverses multiple roots, skips caches and supports cancellation',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-scan-test-'));t.after(async()=>{assert.equal(path.resolve(path.dirname(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
  for(const folder of ['disk1/Portable','disk2/Games','disk1/node_modules'])await fs.mkdir(path.join(root,folder),{recursive:true});
  for(const file of ['disk1/Portable/Editor.exe','disk2/Games/Game.exe','disk1/node_modules/ignored.exe'])await fs.writeFile(path.join(root,file),'fixture');
  const roots=[path.join(root,'disk1'),path.join(root,'disk2')];const progress=[];
  const result=await scanVolumes(roots,{platform:'win32',onProgress:p=>progress.push(p)});assert.equal(result.candidates.length,2);assert.ok(progress.length);
  const controller=new AbortController();controller.abort();await assert.rejects(scanVolumes(roots,{signal:controller.signal}),/annulée/);
});
test('process tracking ends automatically, counts one interval for multiple instances and ignores unrelated exe names',()=>{
  const tracker=new UsageTracker('win32'),apps=[{id:'a',name:'Editor',executable:'D:\\Tools\\Editor.exe',seconds:0}];
  const p={pid:10,executable:'D:\\Tools\\Editor.exe',name:'Editor.exe'};
  tracker.expect('a',0);tracker.reconcile(apps,[p],1000);assert.equal(tracker.pending.size,0);
  tracker.reconcile(apps,[p,{...p,pid:11}],4000);assert.equal(apps[0].seconds,3);
  tracker.reconcile(apps,[{...p,pid:11}],7000);assert.equal(apps[0].seconds,6);
  tracker.reconcile(apps,[],10000);assert.equal(tracker.sessions.size,0);tracker.reconcile(apps,[],13000);assert.equal(apps[0].seconds,6);
  assert.equal(matches(apps[0],{...p,executable:'C:\\Other\\Editor.exe'},'win32'),false);
  tracker.reconcile(apps,[p],16000);tracker.checkpoint(apps,19000);assert.equal(apps[0].seconds,9);
  assert.equal(executableOf({executable:'env LANG=fr_FR "/opt/My App/editor" %U'},'linux'),'/opt/My App/editor');
});
test('access denied process records do not falsely close a tracked session',()=>{
  const tracker=new UsageTracker('win32'),apps=[{id:'a',executable:'C:/App/editor.exe',seconds:0}];
  tracker.reconcile(apps,[{executable:'C:/App/editor.exe'}],1000);tracker.reconcile(apps,[{executable:null,name:'editor.exe'}],4000);assert.equal(tracker.sessions.size,1);assert.equal(apps[0].seconds,0);
});
test('native process list detects a real child and its disappearance',async()=>{
  const child=spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{stdio:'ignore',windowsHide:true});await once(child,'spawn');
  try{const records=await listProcesses();assert.ok(records.some(p=>p.pid===child.pid));const a={id:'fixture',executable:process.execPath,seconds:0};const tracker=new UsageTracker();tracker.reconcile([a],records.filter(p=>p.pid===child.pid),1000);assert.equal(tracker.sessions.size,1);
    const ended=once(child,'exit');child.kill();await ended;const next=await listProcesses();assert.ok(!next.some(p=>p.pid===child.pid));tracker.reconcile([a],next.filter(p=>p.pid===child.pid),4000);assert.equal(tracker.sessions.size,0);
  }finally{child.kill();}
  assert.ok((await volumeRoots()).length>0);
});
