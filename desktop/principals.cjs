const pathKey=value=>String(value||'').replace(/\\/g,'/').toLowerCase();
const normalized=value=>String(value||'').normalize('NFKC').trim().toLowerCase();
function hasName(value){
  if(typeof value!=='string')return false;
  const name=normalized(value).replace(/[\u0000-\u001f\u007f\u200b-\u200f\ufeff]/g,'').trim();
  return /[\p{L}\p{N}]/u.test(name)&&!['undefined','null','(null)','sans nom','application sans nom','unnamed','[object object]'].includes(name);
}
const families=[
  {id:'battlenet',name:'Battle.net',pattern:/^(?:battle[.\s_-]?net)(?:$|[\s._-]|\d)/i,main:['battle.net launcher.exe','battle.net.exe','battlenet.exe','battle.net.app']},
  {id:'overwolf',name:'Overwolf',pattern:/^overwolf(?:$|[\s._-]|browser|launcher|updater|helper|service|\d)/i,main:['overwolf.exe','overwolflauncher.exe','overwolf.app']},
  {id:'steam',name:'Steam',pattern:/^steam(?:$|\s*\(\d+\)$|\s+client\b|client|service|webhelper|errorreporter|\d)/i,main:['steam.exe','steam','steam.app']},
  {id:'epic',name:'Epic Games Launcher',pattern:/^epic\s*games\s*launcher(?:$|[\s._-])/i,main:['epicgameslauncher.exe','epic games launcher.app']},
  {id:'gog',name:'GOG Galaxy',pattern:/^(?:gog\s*galaxy|galaxy\s*client)(?:$|[\s._-])/i,main:['galaxyclient.exe','gog galaxy.app']},
  {id:'ubisoft',name:'Ubisoft Connect',pattern:/^ubisoft\s*connect(?:$|[\s._-])/i,main:['ubisoftconnect.exe','upc.exe']},
  {id:'ea',name:'EA app',pattern:/^(?:ea\s*app|ea\s*desktop)(?:$|[\s._-])/i,main:['eadesktop.exe','ealauncher.exe','ea app.app']},
  {id:'riot',name:'Riot Client',pattern:/^(?:riot\s*client|client\s*riot)(?:$|[\s._-])/i,main:['riotclientservices.exe','riot client.app']}
];
function principalInfo(a){
  const executable=pathKey(a.executable||a.target);
  const base=executable.split('/').pop();
  const byName=families.find(f=>f.pattern.test(a.name||''));
  const family=byName||(!a.arguments&&families.find(f=>f.main.includes(base)||f.pattern.test(a.productName||'')));
  if(!family)return null;
  // Named launchers with no resolved executable (e.g. macOS or a .desktop) stay eligible.
  const unknownExecutable=!a.executable&&(!base||/\.(lnk|desktop)$/.test(base));
  const index=family.main.indexOf(base);
  return {family:family.id,name:family.name,primary:index>=0||unknownExecutable,rank:index<0?0:1000-index*25};
}
function identity(a){
  const info=principalInfo(a);if(info)return 'family:'+info.family;
  const executable=a.processExecutable||a.executable;
  if(executable&&!a.trackingUnsupported){
    const base=pathKey(executable).split('/').pop();
    const product=normalized(a.productName||a.name).replace(/\s*\(\d+\)$/,'');
    // Same product and same entry executable: versions/copies, not unrelated helpers.
    if(product&&base)return `product:${product}|${base}|${a.arguments||''}`;
  }
  return 'target:'+(process.platform==='win32'?pathKey(a.target):String(a.target||''));
}
function rank(a){
  let score=principalInfo(a)?.rank||0;
  const target=pathKey(a.executable||a.target);
  if(a.available===false)score-=10000;
  if(/\/(?:downloads?|telechargements?|backup|old|archive|temp|tmp)\//.test(target))score-=500;
  if(/\/(?:battle\.net[. -]\d+|\d+\.\d+(?:\.\d+)*)(?:\/|$)/.test(target))score-=150;
  if(/\.lnk$/i.test(a.target||''))score+=40;
  if(a.source==='manual')score+=10;
  return score;
}
function compareVersions(a,b){const left=String(a.version||'').match(/\d+/g)||[],right=String(b.version||'').match(/\d+/g)||[];for(let i=0;i<Math.max(left.length,right.length);i++){const difference=Number(left[i]||0)-Number(right[i]||0);if(difference)return difference;}return 0;}
function alternate(a){return {target:a.target,executable:a.executable,processExecutable:a.processExecutable,arguments:a.arguments,trackingUnsupported:a.trackingUnsupported};}
function consolidateLibrary(state){
  const groups=new Map(),removedIds=new Set(),redirect=new Map(),auxiliary=[];let removed=0;
  for(const a of state.apps){
    const info=principalInfo(a);
    if(!hasName(a.name)||info&&!info.primary){if(a.id)removedIds.add(a.id);if(hasName(a.name)&&info)auxiliary.push(a);removed++;continue;}
    const key=identity(a);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);
  }
  const apps=[];
  for(const group of groups.values()){
    const anchor=group[0],winner=[...group].sort((a,b)=>rank(b)-rank(a)||compareVersions(b,a)||String(a.target||'').length-String(b.target||'').length)[0];
    const combined=[...group.flatMap(a=>[alternate(a),...(a.alternateTargets||[])])];
    const known=new Set(),alternates=[];
    const primaryKey=pathKey(winner.executable||winner.target)+'|'+(winner.arguments||'');
    for(const target of combined){const key=pathKey(target.executable||target.target)+'|'+(target.arguments||'');if(key!==primaryKey&&!known.has(key)){known.add(key);alternates.push(target);}}
    const preserved={id:anchor.id,seconds:Math.max(...group.map(a=>Number(a.seconds)||0)),favorite:group.some(a=>a.favorite),lastUsed:Math.max(...group.map(a=>a.lastUsed||0))};
    for(const field of ['name','category','type','hidden']){const custom=group.find(a=>a.overrides?.[field]);if(custom)preserved[field]=custom[field];}
    const overrides=Object.assign({},...group.map(a=>a.overrides||{}));
    for(const a of group.slice(1))if(a.id){redirect.set(a.id,anchor.id);removed++;}
    Object.assign(anchor,winner,preserved,{overrides,alternateTargets:alternates});
    const info=principalInfo(anchor);if(info&&!overrides.name)anchor.name=info.name;
    apps.push(anchor);
  }
  state.apps=apps;
  for(const a of auxiliary){const primary=apps.find(p=>principalInfo(p)?.family===principalInfo(a)?.family);if(a.id&&primary?.id){removedIds.delete(a.id);redirect.set(a.id,primary.id);}}
  for(const routine of state.routines||[])routine.appIds=[...new Set(routine.appIds.filter(id=>!removedIds.has(id)).map(id=>redirect.get(id)||id))];
  return {removed};
}
function selectPrincipals(candidates){const state={apps:candidates.map(a=>({...a})),routines:[]};consolidateLibrary(state);return state.apps;}
module.exports={hasName,principalInfo,consolidateLibrary,selectPrincipals};
