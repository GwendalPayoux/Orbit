const {_electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-desktop-test-'));let electron;
  try{
    await fs.writeFile(path.join(profile,'library.json'),JSON.stringify({apps:[{id:'node',target:process.execPath,executable:process.execPath,name:'Node.js (test)',type:'software',category:'Développement',seconds:0,version:'24',hidden:false,source:'manual',overrides:{type:true,category:true,hidden:true}}],categories:['Développement'],theme:'dark',scannedOnce:true}));
    const env={...process.env,ORBIT_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
    electron=await _electron.launch({executablePath:require('electron'),args:['.'],env,timeout:30000});
    const page=await electron.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('.card').first().waitFor();
    assert.equal(await page.locator('.hero').isVisible(),false);assert.equal(await page.locator('#rescan').isVisible(),true);
    const icon=await page.evaluate(()=>window.orbit.icon('node'));assert.ok(icon?.startsWith('data:image/png;base64,'));
    await electron.evaluate(({dialog})=>{const original=dialog.showOpenDialog;global.pickerReady=new Promise(resolve=>{global.markPickerReady=resolve;});dialog.showOpenDialog=()=>{global.markPickerReady();return new Promise(resolve=>{global.finishPicker=()=>{dialog.showOpenDialog=original;resolve({canceled:true,filePaths:[]});};});};});
    const pendingPicker=page.evaluate(()=>window.orbit.add());await electron.evaluate(()=>global.pickerReady);
    // A file picker must not hold the serialization queue used by the observer.
    await page.evaluate(()=>window.orbit.categories('add','Développement/Pendant le sélecteur'));
    await electron.evaluate(()=>global.finishPicker());await pendingPicker;
    await page.evaluate(()=>window.orbit.categories('add','Développement/Tests'));
    let library=await page.evaluate(()=>window.orbit.saveRoutine('','Routine de test',['node']));assert.equal(library.routines.length,1);
    library=await page.evaluate(()=>window.orbit.library());assert.ok(library.categories.includes('Développement/Tests'));
    await page.waitForFunction(()=>document.querySelector('[data-launch="node"]')?.textContent==='En cours',{},{timeout:15000});
    const update=await page.evaluate(()=>window.orbit.updateStatus());assert.equal(update.phase,'development');
    await page.screenshot({path:'desktop-smoke-preview.png',fullPage:true});assert.deepEqual(errors,[]);
    await electron.close();electron=null;
    const saved=JSON.parse(await fs.readFile(path.join(profile,'library.json'),'utf8'));assert.equal(saved.routines.length,1);assert.ok(saved.apps[0].seconds>=0);
    console.log('Native Electron verified: isolated profile, preload IPC, OS icon, nested categories, routine persistence, real process detection and clean shutdown.');
  }finally{
    if(electron)await electron.close();assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()));await fs.rm(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
