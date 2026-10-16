const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classify, mergeScan } = require('../desktop/classification.cjs');
test('maintenance and system shortcuts are hidden, ordinary useful apps stay visible', () => {
  for (const name of ['Uninstall Blender','Désinstaller Steam','Crash Reporter','Windows PowerShell','Panneau de configuration']) assert.equal(classify({name}).hidden,true,name);
  assert.equal(classify({name:'Gestion', executable:'C:\\Windows\\System32\\mmc.exe'}).hidden,true);
  for (const name of ['Microsoft Word','Blender','Paint','Notepad','Mon outil inconnu']) assert.equal(classify({name}).hidden,false,name);
});
test('game folders and metadata identify unknown games but not launchers or uninstallers', () => {
  assert.equal(classify({name:'Mystery',executable:'D:\\SteamLibrary\\steamapps\\common\\Mystery\\game.exe'}).type,'game');
  assert.equal(classify({name:'Chess',desktopCategories:'Game;BoardGame;'}).type,'game');
  assert.equal(classify({name:'Steam',description:'Game platform'}).type,'software');
  assert.equal(classify({name:'Uninstall',executable:'D:/steamapps/common/Game/uninstall.exe'}).hidden,true);
});
test('professional software receives categories and unknowns are not guessed', () => {
  for (const [name,category] of [['Blender','Création'],['Visual Studio Code','Développement'],['Microsoft Excel','Travail'],['Firefox','Internet']]) assert.equal(classify({name}).category,category);
  assert.equal(classify({name:'Random',desktopCategories:'Development;'}).category,'Développement');
  const unknown=classify({name:'Random application'});assert.equal(unknown.category,'');assert.equal(unknown.classification.confidence,'low');
});
test('rescan classifies old entries, preserves edits and restores no deleted category', () => {
  const state={apps:[{id:'old',target:'old.lnk',name:'Blender',type:'software',category:'',seconds:100}],categories:[]};
  const candidate={target:'old.lnk',name:'Blender',version:'4.5'};
  assert.deepEqual(mergeScan(state,[candidate],()=> 'new'),{added:0,hidden:0});
  assert.equal(state.apps[0].category,'Création'); assert.equal(state.apps[0].seconds,100); assert.equal(state.apps[0].version,'4.5');
  Object.assign(state.apps[0],{type:'game',category:'Personnel',hidden:false,overrides:{type:true,category:true,hidden:true}});
  mergeScan(state,[{...candidate,name:'Uninstall Blender'}],()=> 'new');
  assert.equal(state.apps[0].type,'game');assert.equal(state.apps[0].category,'Personnel');assert.equal(state.apps[0].hidden,false);
  state.categoryAliases={'Développement':''};
  mergeScan(state,[{name:'Visual Studio Code',target:'vscode.lnk'}],()=> 'new');
  assert.equal(state.apps[1].category,'');assert.ok(!state.categories.includes('Développement'));
});
test('rescans do not duplicate apps and hidden items remain recoverable', () => {
  const state={apps:[],categories:[]}; const candidates=[{name:'Uninstall',target:'uninstall.lnk'},{name:'Hollow Knight',target:'game.lnk'}];
  assert.deepEqual(mergeScan(state,candidates,()=> String(state.apps.length)),{added:2,hidden:1});
  assert.deepEqual(mergeScan(state,candidates,()=> 'bad'),{added:0,hidden:1});assert.equal(state.apps.length,2);
  state.apps[0].hidden=false;state.apps[0].overrides.hidden=true;
  mergeScan(state,candidates,()=> 'bad');assert.equal(state.apps[0].hidden,false);
});
