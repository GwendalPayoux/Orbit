const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hasName,selectPrincipals,consolidateLibrary}=require('../desktop/principals.cjs');
const {mergeScan}=require('../desktop/classification.cjs');
const {matches}=require('../desktop/processes.cjs');
test('empty or placeholder names are excluded before importing',()=>{
  for(const name of [undefined,null,'','  ','\u200b','---','undefined','null','Sans nom','[object Object]'])assert.equal(hasName(name),false,String(name));
  for(const name of ['Éditeur','应用','3D Tool'])assert.equal(hasName(name),true);
  const s={apps:[],categories:[]};mergeScan(s,[{name:'',target:'empty.exe'},{name:'Blender',target:'blender.exe'}],()=> 'a');assert.equal(s.apps.length,1);assert.equal(s.apps[0].name,'Blender');
});
test('Battle.net and Overwolf each keep one root principal independent of scan order',()=>{
  const candidates=[
    {name:'Battle.net',target:'C:/Battle.net/Battle.net.999/Battle.net.exe',executable:'C:/Battle.net/Battle.net.999/Battle.net.exe',version:'999'},
    {name:'Battle.net',target:'C:/Battle.net/Battle.net Launcher.exe',executable:'C:/Battle.net/Battle.net Launcher.exe'},
    {name:'Battle.net',target:'C:/Battle.net/Agent.exe',executable:'C:/Battle.net/Agent.exe',productName:'Battle.net'},
    {name:'Overwolf',target:'C:/Overwolf/0.9/Overwolf.exe',executable:'C:/Overwolf/0.9/Overwolf.exe',version:'0.9'},
    {name:'Overwolf',target:'C:/Overwolf/Overwolf.exe',executable:'C:/Overwolf/Overwolf.exe'},
    {name:'Overwolf Browser',target:'C:/Overwolf/OverwolfBrowser.exe',executable:'C:/Overwolf/OverwolfBrowser.exe'}
  ];
  for(const list of [candidates,[...candidates].reverse()]){const selected=selectPrincipals(list);assert.equal(selected.length,2);assert.equal(selected.find(a=>a.name==='Battle.net').target,'C:/Battle.net/Battle.net Launcher.exe');assert.equal(selected.find(a=>a.name==='Overwolf').target,'C:/Overwolf/Overwolf.exe');}
});
test('cleanup keeps IDs, favorites, time and routine membership; alternate main exe remains trackable',()=>{
  const s={apps:[
    {id:'old',name:'Battle.net',target:'C:/Battle.net/Battle.net.999/Battle.net.exe',executable:'C:/Battle.net/Battle.net.999/Battle.net.exe',seconds:80,favorite:true},
    {id:'new',name:'Battle.net',target:'C:/Battle.net/Battle.net Launcher.exe',executable:'C:/Battle.net/Battle.net Launcher.exe',seconds:70},
    {id:'agent',name:'Battle.net',productName:'Battle.net',target:'C:/Battle.net/Agent.exe',executable:'C:/Battle.net/Agent.exe'},
    {id:'empty',name:' ',target:'empty.exe'}
  ],routines:[{appIds:['old','new','agent','empty']}]};
  consolidateLibrary(s);assert.equal(s.apps.length,1);assert.equal(s.apps[0].id,'old');assert.equal(s.apps[0].favorite,true);assert.equal(s.apps[0].seconds,80);assert.deepEqual(s.routines[0].appIds,['old']);
  assert.equal(matches(s.apps[0],{executable:'C:/Battle.net/Battle.net.999/Battle.net.exe'},'win32'),true);
  assert.equal(matches(s.apps[0],{executable:'C:/Battle.net/Agent.exe'},'win32'),false);
});
test('game shortcuts using Steam and independent products with identical names stay distinct',()=>{
  const candidates=[{name:'Steam',target:'steam.lnk',executable:'C:/Steam/steam.exe'},
    {name:'Hollow Knight',target:'game.lnk',executable:'C:/Steam/steam.exe',arguments:'-applaunch 123'},
    {name:'Editor',target:'C:/A/editor.exe',executable:'C:/A/editor.exe',productName:'First Product'},
    {name:'Editor',target:'C:/B/editor.exe',executable:'C:/B/editor.exe',productName:'Second Product'}];
  assert.equal(selectPrincipals(candidates).length,4);
});
test('product versions are coalesced without collapsing different shortcut arguments',()=>{
  const candidates=[{name:'Tool',productName:'Tool',target:'C:/Tool/1/tool.exe',executable:'C:/Tool/1/tool.exe',version:'1.0'},
    {name:'Tool',productName:'Tool',target:'C:/Tool/2/tool.exe',executable:'C:/Tool/2/tool.exe',version:'2.0'},
    {name:'Tool',productName:'Tool',target:'profile.lnk',executable:'C:/Tool/2/tool.exe',arguments:'--profile work'}];
  const selected=selectPrincipals(candidates);assert.equal(selected.length,2);assert.equal(selected.find(a=>!a.arguments).version,'2.0');
});
