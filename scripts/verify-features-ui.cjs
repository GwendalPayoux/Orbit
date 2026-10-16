const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1320,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      const state={apps:[{id:'blender',name:'Blender',type:'software',category:'Création',seconds:0},{id:'game',name:'Hollow Knight',type:'game',category:'Jeux',seconds:60},{id:'steam',name:'Steam',type:'software',category:'Jeux/Launchers',seconds:0}],categories:['Création','Jeux','Jeux/Launchers'],routines:[],theme:'dark',scannedOnce:false,running:[],pending:[]};
      const copy=()=>structuredClone(state);let usage;
      window.testUsage=value=>usage(value);window.routineRuns=0;
      window.orbit={
        library:async()=>copy(),
        scan:async()=>{state.scannedOnce=true;return {state:copy(),added:0,hidden:0,scanSummary:{roots:['C:/','D:/'],unreadable:0}};},
        icon:async()=> 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC4kAAAAASUVORK5CYII=',
        onUsage:fn=>{usage=fn;},
        update:async(id,changes)=>{Object.assign(state.apps.find(a=>a.id===id),changes);return copy();},
        categories:async(action,name,next)=>{if(action==='add')state.categories.push(name);if(action==='rename'){state.categories=state.categories.map(c=>c===name||c.startsWith(name+'/')?next+c.slice(name.length):c);for(const a of state.apps)if(a.category===name||a.category.startsWith(name+'/'))a.category=next+a.category.slice(name.length);}return copy();},
        saveRoutine:async(id,name,ids)=>{const r=state.routines.find(r=>r.id===id);if(r)Object.assign(r,{name,appIds:ids});else state.routines.push({id:'routine',name,appIds:ids});return copy();},
        deleteRoutine:async()=>{state.routines=[];return copy();},
        runRoutine:async()=>{window.routineRuns++;return {state:copy(),launched:1,errors:[{name:'Steam',message:'fixture failure'}]};}
      };
    });
    await page.goto(pathToFileURL(path.resolve('ui/index.html')).href);await page.locator('.card').first().waitFor();
    assert.equal(await page.locator('#edit-version').count(),0);
    assert.ok(!(await page.locator('.metadata').allTextContents()).some(text=>/Version non renseignée|v\d/.test(text)));
    assert.equal(await page.locator('.hero').isVisible(),true);
    await page.locator('#scan').click();assert.equal(await page.locator('.hero').isVisible(),false);assert.equal(await page.locator('#rescan').isVisible(),true);
    await page.waitForFunction(()=>document.querySelectorAll('.app-icon').length===3);
    await page.locator('#tabs [data-filter="game"]').click();assert.equal(await page.locator('.card').count(),2);
    await page.locator('[data-category="Jeux/Launchers"]').click();assert.equal(await page.locator('.card h3').textContent(),'Steam');
    await page.locator('#tabs [data-filter="all"]').click();
    await page.locator('#new-routine').click();await page.locator('#routine-name').fill('Création');
    await page.locator('[name="routine-app"][value="blender"]').check();await page.locator('[name="routine-app"][value="steam"]').check();await page.locator('#routine-form .primary').click();
    assert.equal(await page.locator('.routine-card').count(),1);await page.locator('[data-routine-run]').click();assert.equal(await page.evaluate(()=>window.routineRuns),1);assert.match(await page.locator('#toast').textContent(),/Échec : Steam/);
    await page.locator('[data-routine-edit]').click();await page.locator('#routine-name').fill('Studio');await page.locator('#routine-form .primary').click();assert.equal(await page.locator('.routine-card h3').textContent(),'Studio');
    await page.locator('#new-category').click();await page.locator('#category-name').fill('3D');await page.locator('#category-parent').selectOption('Création');await page.locator('#category-form .primary').click();
    await page.locator('[data-edit="blender"]').click();await page.locator('#edit-category').selectOption('Création/3D');await page.locator('#edit-form button[type="submit"]').click();
    await page.locator('[data-category="Création"]').click();assert.equal(await page.locator('.card').count(),1);
    await page.evaluate(()=>window.testUsage({running:['blender'],pending:[],apps:[{id:'blender',seconds:123,lastUsed:Date.now()}]}));assert.equal(await page.locator('[data-launch="blender"]').isDisabled(),true);assert.match(await page.locator('[data-usage="blender"]').textContent(),/2 min/);
    await page.evaluate(()=>window.testUsage({running:[],pending:[],apps:[{id:'blender',seconds:123}]}));assert.equal(await page.locator('[data-launch="blender"]').isDisabled(),false);assert.equal(await page.locator('[data-launch="blender"]').textContent(),'▷ Lancer');
    await page.locator('#tabs [data-filter="all"]').click();await page.screenshot({path:'orbit-0.4-preview.png',fullPage:true});
    await page.locator('[data-routine-edit]').click();await page.locator('#routine-delete').click();assert.equal(await page.locator('.routine-card').count(),0);
    assert.deepEqual(errors,[]);console.log('Features UI verified: scan layout, icons, nested categories, launchers, routine CRUD/run failures, automatic usage state.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
