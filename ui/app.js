const $=selector=>document.querySelector(selector);
let state={apps:[],categories:[],routines:[],theme:'system',running:[],pending:[]},filter='all',categoryEditing=null,scanning=false;
const native=Boolean(window.orbit),iconCache=new Map();
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const within=(value,parent)=>value===parent||value?.startsWith(parent+'/');
const demo={apps:[['Stardew Valley','game','Jeux','1.6',12600],['Visual Studio Code','software','Travail','1.95',22320],['Blender','software','Création','4.2',7200],['Hollow Knight','game','Jeux','1.5',18000],['Figma','software','Création','',4200],['Obsidian','software','Travail','1.7',3600]].map((a,i)=>({id:String(i),name:a[0],type:a[1],category:a[2],version:a[3],seconds:a[4],favorite:i<2})),categories:['Création','Travail','Jeux','Jeux/Launchers'],routines:[],theme:'system',running:[],pending:[],scannedOnce:false};
const hiddenButton=document.createElement('button');hiddenButton.dataset.filter='hidden';$('#navigation').append(hiddenButton);
const classificationNote=document.createElement('p');classificationNote.className='muted';classificationNote.id='classification-note';
const visibilityButton=document.createElement('button');visibilityButton.type='button';visibilityButton.id='visibility';$('#edit-form .dialog-actions').before(classificationNote,visibilityButton);
$('#edit-form>p.muted').textContent='Le temps est mesuré automatiquement tant que le processus reconnu tourne et qu’Orbit reste ouvert. Certains lanceurs intermédiaires ne permettent pas ce suivi.';
const categoryParent=document.createElement('label');categoryParent.innerHTML='Rubrique parente<select id="category-parent"><option value="">Aucune (rubrique principale)</option></select>';
$('#category-form .dialog-actions').before(categoryParent);$('#category-name').pattern='[^/]+';
const headingActions=document.createElement('div');headingActions.className='heading-actions';$('.heading').append(headingActions);headingActions.append($('#add'));
const rescan=document.createElement('button');rescan.id='rescan';rescan.textContent='↻ Explorer mes disques';headingActions.prepend(rescan);
const scanProgress=document.createElement('p');scanProgress.id='scan-progress';scanProgress.className='muted';scanProgress.setAttribute('role','status');$('.heading').after(scanProgress);
const routinesSection=document.createElement('section');routinesSection.id='routines';routinesSection.innerHTML='<div class="library-title"><h2>Mes routines</h2><button id="new-routine" type="button">+ Créer une routine</button></div><p class="muted">Lancez vos outils ensemble, en un clic.</p><div id="routine-cards"></div>';
$('.library').before(routinesSection);
const routineDialog=document.createElement('dialog');routineDialog.id='routine-dialog';routineDialog.innerHTML='<form id="routine-form"><div class="dialog-heading"><h2>Votre routine</h2><button id="routine-close" type="button" aria-label="Fermer">×</button></div><input id="routine-id" type="hidden"><label>Nom<input id="routine-name" required maxlength="80" placeholder="Ex. Session de création"></label><p class="muted">Sélectionnez les applications à ouvrir ensemble (40 maximum).</p><div id="routine-apps"></div><p id="routine-error" role="alert"></p><div class="dialog-actions"><button id="routine-delete" type="button" class="danger">Supprimer</button><button type="submit" class="primary">Enregistrer</button></div></form>';document.body.append(routineDialog);
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,7000);}
function normalizeState(s){s.apps=(s.apps||[]).filter(a=>typeof a.name==='string'&&/[\p{L}\p{N}]/u.test(a.name)&&!['undefined','null','sans nom'].includes(a.name.trim().toLowerCase()));s.routines||=[];s.pending||=[];s.running||=[];s.paused||=[];s.categories||=[];return s;}
async function call(method,...args){
  try{
    if(native){if(method==='saveRoutine'||method==='runRoutine'||method==='deleteRoutine')return await window.orbit[method](...args);return await window.orbit[method](...args);}
    if(method==='library')return normalizeState(JSON.parse(localStorage.getItem('orbit-preview')||'null')||structuredClone(demo));
    if(['scan','add','launch','runRoutine'].includes(method)){toast('Aperçu web : cette action est disponible dans l’application de bureau.');return method==='scan'?{state,added:0}:method==='runRoutine'?{state,launched:0,errors:[]}:state;}
    if(method==='update')Object.assign(state.apps.find(a=>a.id===args[0]),args[1]);
    if(method==='remove'){state.apps=state.apps.filter(a=>a.id!==args[0]);for(const r of state.routines)r.appIds=r.appIds.filter(id=>id!==args[0]);}
    if(method==='theme')state.theme=args[0];
    if(method==='categories'){
      const [action,name,next]=args;const affected=state.categories.filter(c=>within(c,name));const map=c=>action==='delete'?'':next+c.slice(name.length);
      if(action==='add'&&!state.categories.includes(name))state.categories.push(name);
      if(action==='rename'){state.categories=state.categories.map(c=>affected.includes(c)?map(c):c);state.apps.forEach(a=>{if(within(a.category,name))a.category=map(a.category);});}
      if(action==='delete'){state.categories=state.categories.filter(c=>!affected.includes(c));state.apps.forEach(a=>{if(within(a.category,name))a.category='';});}
    }
    if(method==='saveRoutine'){const [id,name,ids]=args;const existing=state.routines.find(r=>r.id===id);if(existing)Object.assign(existing,{name,appIds:ids});else state.routines.push({id:crypto.randomUUID(),name,appIds:ids});}
    if(method==='deleteRoutine')state.routines=state.routines.filter(r=>r.id!==args[0]);
    localStorage.setItem('orbit-preview',JSON.stringify(state));return state;
  }catch(error){toast(error.message);return null;}
}
function duration(seconds){seconds=Math.floor(seconds||0);return seconds<60?'Moins d’une minute':seconds<3600?`${Math.floor(seconds/60)} min`:`${Math.floor(seconds/3600)} h ${Math.floor(seconds%3600/60)} min`;}
function applyTheme(){document.body.classList.toggle('light',state.theme==='light'||state.theme==='system'&&matchMedia('(prefers-color-scheme: light)').matches);$('#theme').value=state.theme;}
function orderedCategories(){return [...state.categories].sort((a,b)=>a.localeCompare(b,'fr'));}
function render(){
  normalizeState(state);applyTheme();$('#total').textContent=state.apps.filter(a=>!a.hidden).length;
  hiddenButton.textContent=`◌ Applications masquées (${state.apps.filter(a=>a.hidden).length})`;
  $('.hero').hidden=Boolean(state.scannedOnce);rescan.hidden=!state.scannedOnce&&!scanning;
  $('#categories').innerHTML=orderedCategories().map(c=>`<div class="category-row ${c.includes('/')?'subcategory':''}"><button data-category="${escape(c)}" class="${filter==='category:'+c?'active':''}" title="${escape(c.replaceAll('/',' / '))}">${c.includes('/')?'↳':'◌'} ${escape(c.split('/').pop())}</button><button data-edit-category="${escape(c)}" aria-label="Modifier ${escape(c)}">⋯</button></div>`).join('');
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
  $('#view-title').textContent=filter.startsWith('category:')?filter.slice(9).replaceAll('/',' / '):({all:'Bibliothèque',game:'Jeux',software:'Logiciels',favorites:'Favoris',hidden:'Applications masquées'})[filter];
  const query=$('#search').value.toLocaleLowerCase('fr');
  const apps=state.apps.filter(a=>(filter==='hidden'?a.hidden:!a.hidden&&(filter==='all'||filter==='game'&&(a.type==='game'||within(a.category,'Jeux'))||filter==='software'&&a.type==='software'||filter==='favorites'&&a.favorite||filter.startsWith('category:')&&within(a.category,filter.slice(9))))&&a.name.toLocaleLowerCase('fr').includes(query));
  apps.sort((a,b)=>$('#sort').value==='time'?b.seconds-a.seconds:$('#sort').value==='recent'?(b.lastUsed||0)-(a.lastUsed||0):a.name.localeCompare(b.name,'fr'));
  $('#count').textContent=`${apps.length} application${apps.length!==1?'s':''}`;
  $('#footer-count').textContent=native?`${state.apps.length} applications · Données conservées sur cet ordinateur`:'Aperçu interactif · Applications de démonstration';
  $('#apps').innerHTML=apps.map(a=>`<article class="card" data-app="${escape(a.id)}"><div class="cover"><span class="initials" aria-hidden="true">${escape(a.name.slice(0,2).toUpperCase())}</span><button class="favorite" data-favorite="${escape(a.id)}" aria-label="${a.favorite?'Retirer des':'Ajouter aux'} favoris" aria-pressed="${a.favorite}">${a.favorite?'★':'☆'}</button></div><div class="card-body"><div class="card-title"><h3>${escape(a.name)}</h3><button class="edit" data-edit="${escape(a.id)}" aria-label="Modifier ${escape(a.name)}">⋯</button></div><p class="metadata">${a.type==='game'?'Jeu':'Logiciel'}${a.category?' · '+escape(a.category.replaceAll('/',' / ')):''}</p><div class="card-bottom"><span data-usage="${escape(a.id)}">${duration(a.seconds)}</span><button class="launch" data-launch="${escape(a.id)}">▷ Lancer</button></div></div></article>`).join('');
  for(const a of apps)loadIcon(a.id);
  renderUsage();renderRoutines();
  $('#empty').hidden=Boolean(apps.length);$('#empty h3').textContent=state.apps.length?'Aucune application trouvée.':'Un peu d’espace pour vos envies.';
  $('#empty p').textContent=filter==='hidden'?'Les utilitaires et exécutables à vérifier restent accessibles ici.':state.apps.length?'Modifiez votre recherche ou vos filtres.':'Explorez vos disques ou ajoutez votre première application.';
}
function renderUsage(){
  for(const a of state.apps){const label=document.querySelector(`[data-usage="${CSS.escape(a.id)}"]`),button=document.querySelector(`[data-launch="${CSS.escape(a.id)}"]`);if(!label||!button)continue;
    const running=state.running.includes(a.id),pending=state.pending.includes(a.id),paused=state.paused.includes(a.id);label.textContent=`${running?'● ':''}${duration(a.seconds)}${paused?' · Suivi suspendu':a.trackingUnsupported?' · Suivi indisponible':''}`;label.classList.toggle('running',running);button.textContent=running?'En cours':pending?'Démarrage…':'▷ Lancer';button.disabled=running||pending;
  }
}
function loadIcon(id){
  if(!window.orbit?.icon)return;
  if(!iconCache.has(id))iconCache.set(id,window.orbit.icon(id).catch(()=>null));
  iconCache.get(id).then(data=>{
    if(!data?.startsWith('data:image/png;base64,'))return;const cover=document.querySelector(`[data-app="${CSS.escape(id)}"] .cover`);if(!cover||cover.querySelector('img'))return;
    const img=document.createElement('img');img.alt='';img.className='app-icon';img.hidden=true;img.onload=()=>{const initial=cover.querySelector('.initials');if(initial)initial.hidden=true;img.hidden=false;};img.onerror=()=>img.remove();img.src=data;cover.prepend(img);
  });
}
function renderRoutines(){
  $('#routine-cards').innerHTML=state.routines.length?state.routines.map(r=>`<article class="routine-card"><div><h3>${escape(r.name)}</h3><p>${r.appIds.length} application(s)</p></div><button data-routine-run="${escape(r.id)}" class="primary" ${r.appIds.length?'':'disabled'}>▷ Activer</button><button data-routine-edit="${escape(r.id)}" aria-label="Modifier ${escape(r.name)}">⋯</button></article>`).join(''):'<p class="routine-empty muted">Créez une routine pour votre travail, vos jeux ou vos projets.</p>';
}
async function update(method,...args){const result=await call(method,...args);if(result){state=normalizeState(result);render();return true;}return false;}
document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.filter){filter=b.dataset.filter;render();}
  if(b.dataset.category){filter='category:'+b.dataset.category;render();}
  if(b.dataset.editCategory)openCategory(b.dataset.editCategory);
  if(b.dataset.favorite){const a=state.apps.find(a=>a.id===b.dataset.favorite);await update('update',a.id,{favorite:!a.favorite});}
  if(b.dataset.launch){b.disabled=true;await update('launch',b.dataset.launch);b.disabled=false;renderUsage();}
  if(b.dataset.edit){const a=state.apps.find(a=>a.id===b.dataset.edit);$('#edit-id').value=a.id;$('#edit-name').value=a.name;$('#edit-type').value=a.type;$('#edit-category').innerHTML='<option value="">Sans rubrique</option>'+orderedCategories().map(c=>`<option value="${escape(c)}">${escape(c.replaceAll('/',' / '))}</option>`).join('');$('#edit-category').value=a.category;classificationNote.textContent=a.classification?`Pré-tri : ${a.classification.reason}. ${a.classification.confidence==='low'?'À vérifier.':''}`:'Application ajoutée ou classée manuellement.';visibilityButton.textContent=a.hidden?'Afficher dans la bibliothèque':'Masquer de la bibliothèque';$('#editor').showModal();}
  if(b.dataset.routineEdit)openRoutine(b.dataset.routineEdit);
  if(b.dataset.routineRun){b.disabled=true;const result=await call('runRoutine',b.dataset.routineRun);if(result){state=normalizeState(result.state);render();toast(result.errors.length?`${result.launched} application(s) lancée(s). Échec : ${result.errors.map(e=>e.name).join(', ')}.`:`${result.launched} application(s) prête(s).`);}b.disabled=false;}
});
$('#search').addEventListener('input',render);$('#sort').addEventListener('change',render);$('#theme').addEventListener('change',()=>update('theme',$('#theme').value));matchMedia('(prefers-color-scheme: light)').addEventListener('change',applyTheme);
$('#grid-view').onclick=()=>setView(false);$('#list-view').onclick=()=>setView(true);
function setView(list){$('#apps').classList.toggle('list',list);$('#grid-view').setAttribute('aria-pressed',!list);$('#list-view').setAttribute('aria-pressed',list);}
$('#add').onclick=$('#empty-add').onclick=()=>update('add');
async function scan(){
  if(scanning){await call('scanCancel');return;}scanning=true;$('#scan').textContent='Annuler l’exploration';rescan.hidden=false;rescan.textContent='Annuler l’exploration';scanProgress.textContent='Recherche sur les disques accessibles…';
  const result=await call('scan');scanning=false;
  if(result){state=normalizeState(result.state);iconCache.clear();render();if(native){const s=result.scanSummary;toast(`${result.added} nouvelle(s) application(s), ${result.hidden||0} masquée(s). ${s?.roots.length||0} disque(s) ou volume(s), ${s?.unreadable||0} dossier(s) inaccessible(s).`);}}
  $('#scan').textContent='Explorer mon ordinateur ↗';rescan.textContent='↻ Explorer mes disques';rescan.hidden=!state.scannedOnce;scanProgress.textContent='';
}
$('#scan').onclick=rescan.onclick=scan;
visibilityButton.onclick=async()=>{const a=state.apps.find(a=>a.id===$('#edit-id').value);if(await update('update',a.id,{hidden:!a.hidden}))$('#editor').close();};
$('#close-editor').onclick=()=>$('#editor').close();$('#edit-form').onsubmit=async e=>{e.preventDefault();if(await update('update',$('#edit-id').value,{name:$('#edit-name').value,type:$('#edit-type').value,category:$('#edit-category').value}))$('#editor').close();};
$('#remove').onclick=async()=>{if(await update('remove',$('#edit-id').value)){$('#editor').close();toast('Application retirée. Elle reste installée sur votre ordinateur.');}};
function openCategory(name=null){categoryEditing=name;$('#category-title').textContent=name?'Modifier la rubrique':'Nouvelle rubrique';$('#category-name').value=name?.split('/').pop()||'';$('#delete-category').hidden=!name;$('#category-parent').innerHTML='<option value="">Aucune (rubrique principale)</option>'+orderedCategories().filter(c=>!name||!within(c,name)).map(c=>`<option value="${escape(c)}">${escape(c.replaceAll('/',' / '))}</option>`).join('');$('#category-parent').value=name?.includes('/')?name.slice(0,name.lastIndexOf('/')):'';$('#category-dialog').showModal();}
$('#new-category').onclick=()=>openCategory();$('#cancel-category').onclick=()=>$('#category-dialog').close();
$('#category-form').onsubmit=async e=>{e.preventDefault();const leaf=$('#category-name').value.trim(),parent=$('#category-parent').value,name=parent?parent+'/'+leaf:leaf;if(!leaf||leaf.includes('/'))return;if(state.categories.includes(name)&&name!==categoryEditing){toast('Cette rubrique existe déjà.');return;}if(await update('categories',categoryEditing?'rename':'add',categoryEditing||name,name)){if(filter.startsWith('category:')&&categoryEditing&&within(filter.slice(9),categoryEditing)){filter='category:'+name+filter.slice(9+categoryEditing.length);render();}$('#category-dialog').close();}};
$('#delete-category').onclick=async()=>{const deleted=categoryEditing;if(await update('categories','delete',deleted)){if(filter.startsWith('category:')&&within(filter.slice(9),deleted)){filter='all';render();}$('#category-dialog').close();toast('Rubrique et sous-rubriques supprimées. Leurs applications restent dans la bibliothèque.');}};
function openRoutine(id=''){
  const r=state.routines.find(r=>r.id===id);$('#routine-id').value=id;$('#routine-name').value=r?.name||'';$('#routine-delete').hidden=!r;$('#routine-error').textContent='';
  $('#routine-apps').innerHTML=state.apps.filter(a=>!a.hidden||r?.appIds.includes(a.id)).sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(a=>`<label><input type="checkbox" name="routine-app" value="${escape(a.id)}" ${r?.appIds.includes(a.id)?'checked':''}> ${escape(a.name)}</label>`).join('');routineDialog.showModal();
}
$('#new-routine').onclick=()=>openRoutine();$('#routine-close').onclick=()=>routineDialog.close();
$('#routine-form').onsubmit=async e=>{e.preventDefault();const ids=[...document.querySelectorAll('[name="routine-app"]:checked')].map(i=>i.value);if(!ids.length||ids.length>40){$('#routine-error').textContent='Sélectionnez entre 1 et 40 applications.';return;}if(await update('saveRoutine',$('#routine-id').value,$('#routine-name').value.trim(),ids))routineDialog.close();};
$('#routine-delete').onclick=async()=>{if(await update('deleteRoutine',$('#routine-id').value))routineDialog.close();};
if(window.orbit?.onScanProgress)window.orbit.onScanProgress(p=>{scanProgress.textContent=p.phase==='metadata'?`Analyse des métadonnées de ${p.found} exécutables…`:`${p.folders||0} dossiers explorés · ${p.found||0} fichiers candidats · ${p.unreadable||0} dossiers inaccessibles`;});
const usageNotice=document.createElement('p');usageNotice.id='usage-notice';usageNotice.setAttribute('role','status');$('.library').prepend(usageNotice);
if(window.orbit?.onUsageError)window.orbit.onUsageError(message=>{usageNotice.textContent=message;});
if(window.orbit?.onUsage)window.orbit.onUsage(s=>{usageNotice.textContent='';state.running=s.running;state.pending=s.pending;state.paused=s.paused||[];for(const usage of s.apps){const a=state.apps.find(a=>a.id===usage.id);if(a)Object.assign(a,usage);}renderUsage();});
call('library').then(result=>{if(result){state=normalizeState(result);render();}});
