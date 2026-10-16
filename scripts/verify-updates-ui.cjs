const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1320,height:960}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(() => {
      let status={phase:'idle',currentVersion:'0.3.0',availableVersion:null,progress:0};let listener;
      const send = patch => {status={...status,...patch};listener?.({...status});return {...status};};
      window.testUpdateSend=send;window.installCalls=0;
      window.orbit={
        library:async()=>({apps:[],categories:[],theme:'dark',running:[]}),
        updateStatus:async()=>({...status}),onUpdateStatus:fn=>{listener=fn;},
        checkUpdates:async()=>send({phase:'available',availableVersion:'0.4.0',lastChecked:Date.now()}),
        downloadUpdate:async()=>send({phase:'downloading',progress:36}),
        installUpdate:async()=>{window.installCalls++;return send({phase:'installing'});}
      };
    });
    await page.goto(pathToFileURL(path.resolve('ui/index.html')).href);
    await page.locator('#update-open').click();
    await page.locator('#update-check').click();
    assert.match(await page.locator('#update-title').textContent(),/0\.4\.0/);
    assert.equal(await page.locator('#update-banner').isVisible(),true);
    await page.locator('#update-action').click();
    assert.equal(await page.locator('#update-progress').getAttribute('value'),'36');
    assert.equal(await page.locator('#update-check').isDisabled(),true);
    await page.evaluate(()=>window.testUpdateSend({phase:'error',retry:'download',error:'Connexion interrompue.'}));
    assert.equal(await page.locator('#update-action').textContent(),'Réessayer');
    await page.locator('#update-action').click();
    await page.evaluate(()=>window.testUpdateSend({phase:'downloaded',availableVersion:'0.4.0',progress:100}));
    assert.equal(await page.evaluate(()=>window.installCalls),0);
    await page.locator('#update-close').click();
    await page.locator('#update-banner-action').click();
    assert.equal(await page.locator('#update-dialog').isVisible(),true);
    assert.equal(await page.evaluate(()=>window.installCalls),0);
    assert.equal(await page.locator('#update-restart-note').isVisible(),true);
    await page.screenshot({path:'updates-preview.png',fullPage:true});
    await page.locator('#update-action').click();
    assert.equal(await page.evaluate(()=>window.installCalls),1);
    await page.evaluate(()=>window.testUpdateSend({phase:'unconfigured'}));
    assert.equal(await page.locator('#update-check').isDisabled(),true);
    assert.equal(await page.locator('#update-banner').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('Update UI verified: availability, notification banner, progress, retry, explicit restart, unconfigured feed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
