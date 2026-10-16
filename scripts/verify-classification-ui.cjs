// Check the actual scan merge through a mocked desktop bridge, without launching applications.
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');
const { mergeScan } = require('../desktop/classification.cjs');
(async () => {
  const state = { apps: [], categories: [], running: [], theme: 'dark' };
  mergeScan(state, [
    {name:'Uninstall Blender',target:'uninstall.lnk'},
    {name:'Blender',target:'blender.lnk'},
    {name:'Mystery Game',target:'game.lnk',executable:'D:/steamapps/common/Mystery/game.exe'},
    {name:'Microsoft Excel',target:'excel.lnk'},
    {name:'Unknown',target:'unknown.lnk'}
  ], () => String(state.apps.length));
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.addInitScript(initial => {
      window.orbit = {
        library: async () => structuredClone(initial),
        update: async (id,changes) => { Object.assign(initial.apps.find(a => a.id === id),changes);return structuredClone(initial); }
      };
    },state);
    await page.goto(pathToFileURL(path.resolve('ui/index.html')).href);
    await page.locator('.card').first().waitFor();
    assert.equal(await page.locator('.card').count(),4);
    await page.locator('#tabs [data-filter="game"]').click();
    assert.equal(await page.locator('.card h3').textContent(),'Mystery Game');
    await page.locator('[data-category="Travail"]').click();
    assert.equal(await page.locator('.card h3').textContent(),'Microsoft Excel');
    await page.locator('[data-filter="hidden"]').click();
    assert.equal(await page.locator('.card h3').textContent(),'Uninstall Blender');
    await page.locator('[data-edit]').click();
    assert.match(await page.locator('#classification-note').textContent(),/maintenance/);
    await page.locator('#visibility').click();
    await page.locator('#tabs [data-filter="all"]').click();
    assert.equal(await page.locator('.card').count(),5);
    console.log('Classified scan UI verified: games, categories, hidden reasons, restoration.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
