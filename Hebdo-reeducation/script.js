'use strict';

const TABLES = {
  users: 'Usagers',
  reeducations: 'Reeducations',
  practitioners: 'Reeducateurs',
  otherTypes: 'Activites_autres',
  days: 'Jours_de_la_semaine',
  hours: 'Heures',
  parameterCandidates: ['Parametres','Paramètres','Parametres_widget','Parametres_widgets']
};

const DAYS = [
  {name:'Lundi', cls:'lundi'},
  {name:'Mardi', cls:'mardi'},
  {name:'Mercredi', cls:'mercredi'},
  {name:'Jeudi', cls:'jeudi'},
  {name:'Vendredi', cls:'vendredi'}
];

const state = {
  users:[], reeducations:[], practitioners:[], otherTypes:[], days:[], hours:[], parameters:[],
  attachmentUrls:new Map(), attachmentTokenInfo:null, format:'a4', associationLogo:''
};

const $ = id => document.getElementById(id);
const normalize = value => String(value ?? '').trim();
const norm = value => normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const esc = value => normalize(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function rowsFromTable(table){
  if(!table || !Array.isArray(table.id)) return [];
  return table.id.map((id,i)=>{
    const row={id:Number(id)};
    for(const [key,value] of Object.entries(table)) row[key]=Array.isArray(value)?value[i]:value;
    return row;
  });
}
function listIds(value){
  if(Array.isArray(value)) return (value[0]==='L'?value.slice(1):value).flat().map(Number).filter(Number.isFinite);
  const n=Number(value); return Number.isFinite(n)&&n!==0?[n]:[];
}
function firstId(value){ return listIds(value)[0] ?? null; }
function byId(rows){ return new Map(rows.map(row=>[Number(row.id),row])); }
function get(row,...names){ for(const name of names) if(row && row[name]!==undefined && row[name]!==null && row[name]!=='') return row[name]; return ''; }
function cleanChoice(value){ return normalize(value).replace(/^[^\p{L}\p{N}]+/u,'').trim(); }
function minutes(value){ const m=normalize(value).match(/(\d{1,2})\s*[:h]\s*(\d{2})/i); return m?Number(m[1])*60+Number(m[2]):9999; }
function initials(name){ return normalize(name).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() || '?'; }

function userName(user){
  return normalize(get(user,'Usager')) || `${normalize(get(user,'Prenom','Prénom'))} ${normalize(get(user,'Nom')).toUpperCase()}`.trim();
}
function practitionerName(row){
  return normalize(get(row,'Partenaire','Nom2')) || `${normalize(get(row,'Prenom','Prénom'))} ${normalize(get(row,'Nom'))}`.trim() || 'Praticien';
}
function practitionerOrganisation(row){
  return cleanChoice(get(row,'Organisation','Cabinet','Structure'));
}
function organisationKind(row){
  const n=norm(practitionerOrganisation(row));
  if(n.includes('ckpsp')) return 'ckpsp';
  if(n.includes('grillon')) return 'grillon';
  return 'other';
}
function refText(value, rows, names){
  const row=byId(rows).get(firstId(value));
  return row?normalize(get(row,...names)):normalize(value);
}
function dayText(rd){
  return cleanChoice(normalize(get(rd,'gristHelper_Display2')) || refText(get(rd,'Jour'),state.days,['Jour']));
}
function hourText(rd){
  return cleanChoice(normalize(get(rd,'gristHelper_Display3')) || refText(get(rd,'Horaire'),state.hours,['Heures']));
}
function typeText(rd){
  const typeRow=byId(state.otherTypes).get(firstId(get(rd,'Type')));
  return cleanChoice(typeRow ? get(typeRow,'Type','Nom_activite','Nom') : get(rd,'gristHelper_Display','Type'));
}
function typeKind(label){
  const n=norm(label);
  if(n.includes('ortho')) return 'ortho';
  if(n.includes('kine') || n.includes('physio')) return 'kine';
  return 'other';
}
function rawPlaceText(rd){ return cleanChoice(get(rd,'Lieu','gristHelper_Display5')); }
function isCabinetPlace(label){ return norm(label).includes('cabinet'); }

/*
  LOGIQUE MÉTIER KINÉ
  -------------------
  - CKPSP et Grillon = organisation/cabinet d'appartenance du kiné, PAS le lieu du rendez-vous.
  - Par défaut, les professionnels de CKPSP et du Grillon interviennent dans la salle kiné du SAJ.
  - Si Reeducations.Lieu indique « Cabinet », le rendez-vous est extérieur.
  - Les rendez-vous extérieurs Kiné sont considérés comme « Cabinet CKPSP » uniquement.
    Ils correspondent aux personnes autonomes qui s'y rendent seules.
  - Un rendez-vous Grillon n'est jamais reclassé comme rendez-vous extérieur.
*/
function kineLocation(orgKind, rawPlace){
  const requestedCabinet=isCabinetPlace(rawPlace);
  if(requestedCabinet && orgKind==='ckpsp'){
    return {kind:'cabinet', label:'Cabinet CKPSP', autonomous:true};
  }
  return {kind:'salle', label:'Salle kiné', autonomous:false};
}

async function attachmentUrl(value){
  const ids=listIds(value); if(!ids.length) return '';
  const id=ids[0]; if(state.attachmentUrls.has(id)) return state.attachmentUrls.get(id);
  try{
    if(!state.attachmentTokenInfo && grist.docApi.getAccessToken){
      state.attachmentTokenInfo=await grist.docApi.getAccessToken({readOnly:true});
    }
    const token=state.attachmentTokenInfo?.token;
    const base=state.attachmentTokenInfo?.baseUrl || state.attachmentTokenInfo?.baseURL || '';
    if(token && base){
      const url=`${base.replace(/\/$/,'')}/attachments/${id}/download?auth=${encodeURIComponent(token)}`;
      state.attachmentUrls.set(id,url); return url;
    }
  }catch(error){ console.warn('Pièce jointe non disponible',error); }
  return '';
}


function associationLogoAttachment(){
  const preferredColumns=['Logo_association','LogoAssociation','LogoSAJ','Logo_saj','Logo'];
  for(const row of state.parameters){
    for(const col of preferredColumns){
      const value=get(row,col);
      if(listIds(value).length) return value;
    }
  }
  return '';
}

async function loadAssociationLogo(){
  const value=associationLogoAttachment();
  const url=value ? await attachmentUrl(value) : '';
  state.associationLogo=url;
  for(const id of ['associationLogoTop','associationLogoPrint']){
    const el=$(id);
    if(!el) continue;
    if(url){
      el.innerHTML=`<img src="${esc(url)}" alt="Logo de l’association">`;
      el.classList.remove('hidden');
    }else{
      el.innerHTML='';
      el.classList.add('hidden');
    }
  }
}

async function typeVisual(kind){
  const row=state.otherTypes.find(r=>typeKind(get(r,'Type','Nom_activite','Nom'))===kind);
  return row ? attachmentUrl(get(row,'Visuel_act_autre','Visuel')) : '';
}

function buildAppointments(){
  const userMap=byId(state.users);
  const practitionerMap=byId(state.practitioners);
  const result=[];

  for(const rd of state.reeducations){
    const type=typeText(rd);
    const kind=typeKind(type);
    if(!['kine','ortho'].includes(kind)) continue;

    const day=dayText(rd);
    if(!DAYS.some(d=>norm(d.name)===norm(day))) continue;

    const practitioner=practitionerMap.get(firstId(get(rd,'Partenaire')));
    const practitionerId=practitioner?.id ?? null;
    const practitionerLabel=practitioner ? practitionerName(practitioner) : normalize(get(rd,'gristHelper_Display4','gristHelper_Display6')) || '—';
    const organisation=practitioner ? practitionerOrganisation(practitioner) : '';
    const orgKind=practitioner ? organisationKind(practitioner) : 'other';
    const rawPlace=rawPlaceText(rd);

    let location;
    if(kind==='kine'){
      location=kineLocation(orgKind,rawPlace);
    }else{
      location={kind:'other',label:rawPlace || 'Lieu non renseigné',autonomous:false};
    }

    const people=listIds(get(rd,'Usagers','Participants')).map(id=>userMap.get(id)).filter(Boolean);
    for(const person of people){
      result.push({
        rd, kind, type, day, hour:hourText(rd), practitionerId, practitionerLabel,
        organisation, orgKind, location, person, personId:person.id
      });
    }
  }

  return result.sort((a,b)=>{
    const dayA=DAYS.findIndex(d=>norm(d.name)===norm(a.day));
    const dayB=DAYS.findIndex(d=>norm(d.name)===norm(b.day));
    return dayA-dayB || minutes(a.hour)-minutes(b.hour) || userName(a.person).localeCompare(userName(b.person),'fr');
  });
}

function selectedAppointments(all){
  const personId=Number($('personSelect').value)||null;
  const practitionerId=Number($('practitionerSelect').value)||null;
  const showKine=$('typeKine').checked;
  const showOrtho=$('typeOrtho').checked;
  const showCkpsp=$('filterCkpsp').checked;
  const showGrillon=$('filterGrillon').checked;
  const showCabinet=$('filterCabinet').checked;

  return all.filter(appt=>{
    if(personId && appt.personId!==personId) return false;
    if(practitionerId && appt.practitionerId!==practitionerId) return false;

    if(appt.kind==='ortho') return showOrtho;
    if(appt.kind!=='kine' || !showKine) return false;

    // Les trois cases Kiné sont indépendantes :
    // - CKPSP = séances des kinés CKPSP réalisées dans la salle kiné du SAJ ;
    // - Grillon = séances des kinés du Grillon réalisées dans la salle kiné du SAJ ;
    // - Cabinet CKPSP = déplacements autonomes au cabinet CKPSP.
    if(appt.location.kind==='cabinet') return showCabinet;
    if(appt.orgKind==='ckpsp') return showCkpsp;
    if(appt.orgKind==='grillon') return showGrillon;

    // Autre organisation : conserver la séance si Kiné est activé.
    return true;
  });
}

function densityClass(shown){
  const counts=DAYS.map(day=>shown.filter(a=>norm(a.day)===norm(day.name)).length);
  const max=Math.max(0,...counts);
  if(max>=9) return 'density-tight';
  if(max>=6) return 'density-compact';
  return '';
}

function renderBadges(appt){
  if(appt.kind==='ortho') return '';
  const badges=[];
  if(appt.orgKind==='ckpsp') badges.push('<span class="badge org-ckpsp">CKPSP</span>');
  else if(appt.orgKind==='grillon') badges.push('<span class="badge org-grillon">Grillon</span>');
  else if(appt.organisation) badges.push(`<span class="badge">${esc(appt.organisation)}</span>`);
  if(appt.location.kind==='cabinet') badges.push('<span class="badge cabinet">Au cabinet</span>');
  return badges.length ? `<div class="badges">${badges.join('')}</div>` : '';
}

async function render(){
  const all=buildAppointments();
  const shown=selectedAppointments(all);
  $('shownCount').textContent=shown.length;

  const selectedPerson=Number($('personSelect').value)||null;
  if(selectedPerson){
    const person=state.users.find(u=>u.id===selectedPerson);
    const total=all.filter(a=>a.personId===selectedPerson).length;
    $('personCount').textContent=total;
    $('personCountLabel').textContent=`pour ${userName(person)}`;
  }else{
    $('personCount').textContent='—';
    $('personCountLabel').textContent='sélectionner une personne';
  }

  const summary=[];
  if(selectedPerson){ const p=state.users.find(u=>u.id===selectedPerson); if(p) summary.push(userName(p)); }
  if($('practitionerSelect').value){
    const p=state.practitioners.find(x=>x.id===Number($('practitionerSelect').value));
    if(p) summary.push(practitionerName(p));
  }
  $('filterSummary').textContent=summary.length ? `Planning hebdomadaire · ${summary.join(' · ')}` : 'Planning hebdomadaire · lundi au vendredi';

  const sheet=$('printSheet');
  sheet.classList.remove('density-compact','density-tight');
  const density=densityClass(shown); if(density) sheet.classList.add(density);

  const grid=$('weekGrid');
  grid.innerHTML='';
  const portraitPromises=[];

  for(const dayDef of DAYS){
    const dayRows=shown.filter(a=>norm(a.day)===norm(dayDef.name));
    const dayEl=document.createElement('article');
    dayEl.className=`day day-${dayDef.cls}`;
    dayEl.innerHTML=`<header class="day-head">${esc(dayDef.name)}<small>${dayRows.length} rendez-vous</small></header><div class="day-body"></div>`;
    const body=dayEl.querySelector('.day-body');

    if(!dayRows.length) body.innerHTML='<div class="empty">Aucun rendez-vous</div>';

    for(const appt of dayRows){
      const card=document.createElement('div');
      const orgClass=appt.kind==='kine' ? (appt.orgKind==='ckpsp'?'ckpsp':appt.orgKind==='grillon'?'grillon':'') : '';
      const cabinetClass=appt.location.kind==='cabinet'?'cabinet':'';
      card.className=`appt ${appt.kind} ${orgClass} ${cabinetClass}`.trim();
      const portraitId=`portrait-${appt.rd.id}-${appt.personId}`;
      const kindLabel=appt.kind==='kine'?'Kiné':'Orthophonie';
      const locationExtra=appt.location.autonomous?' · autonome':'';

      card.innerHTML=`
        <div id="${portraitId}" class="portrait">${esc(initials(userName(appt.person)))}</div>
        <div class="appt-content">
          <div class="appt-top"><span class="time">${esc(appt.hour || 'Horaire non renseigné')}</span><span class="kind">${kindLabel}</span></div>
          <div class="person-name">${esc(userName(appt.person))}</div>
          <div class="meta">
            <div class="practitioner"><span class="practitioner-label">Praticien :</span> <span class="practitioner-name">${esc(appt.practitionerLabel || 'Non renseigné')}</span></div>
            ${renderBadges(appt)}
            <div class="location">${esc(appt.location.label + locationExtra)}</div>
          </div>
        </div>`;
      body.appendChild(card);

      portraitPromises.push((async()=>{
        const url=await attachmentUrl(get(appt.person,'Portrait'));
        if(url){ const el=document.getElementById(portraitId); if(el) el.innerHTML=`<img src="${esc(url)}" alt="">`; }
      })());
    }
    grid.appendChild(dayEl);
  }

  $('status').classList.add('hidden');
  grid.classList.remove('hidden');
  await Promise.allSettled(portraitPromises);

  const kinePicto=await typeVisual('kine');
  if(kinePicto){
    $('headerPicto').innerHTML=`<img src="${esc(kinePicto)}" alt="Pictogramme kiné">`;
    $('printPicto').innerHTML=`<img src="${esc(kinePicto)}" alt="Pictogramme kiné">`;
  }
}

function fillSelectors(){
  const person=$('personSelect');
  const practitioner=$('practitionerSelect');
  person.innerHTML='<option value="">Toutes les personnes</option>';
  [...state.users].sort((a,b)=>userName(a).localeCompare(userName(b),'fr')).forEach(u=>{
    person.insertAdjacentHTML('beforeend',`<option value="${u.id}">${esc(userName(u))}</option>`);
  });
  practitioner.innerHTML='<option value="">Tous les praticiens</option>';
  [...state.practitioners].sort((a,b)=>practitionerName(a).localeCompare(practitionerName(b),'fr')).forEach(p=>{
    const org=practitionerOrganisation(p);
    const suffix=org?` — ${org}`:'';
    practitioner.insertAdjacentHTML('beforeend',`<option value="${p.id}">${esc(practitionerName(p)+suffix)}</option>`);
  });
}

async function fetchTable(name){
  try{return await grist.docApi.fetchTable(name);}
  catch(error){throw new Error(`Table ${name} introuvable ou inaccessible.\n${error.message||error}`);}
}


async function fetchOptionalFirst(names){
  for(const name of names){
    try{return await grist.docApi.fetchTable(name);}
    catch(error){/* table optionnelle : essayer la suivante */}
  }
  return null;
}

async function loadData(){
  try{
    $('status').textContent='Chargement des rendez-vous…';
    $('status').classList.remove('hidden');
    $('weekGrid').classList.add('hidden');
    state.attachmentUrls.clear();
    state.attachmentTokenInfo=null;

    const [users,reeducations,practitioners,otherTypes,days,hours,parameters]=await Promise.all([
      fetchTable(TABLES.users),fetchTable(TABLES.reeducations),fetchTable(TABLES.practitioners),
      fetchTable(TABLES.otherTypes),fetchTable(TABLES.days),fetchTable(TABLES.hours),
      fetchOptionalFirst(TABLES.parameterCandidates)
    ]);

    state.users=rowsFromTable(users);
    state.reeducations=rowsFromTable(reeducations);
    state.practitioners=rowsFromTable(practitioners);
    state.otherTypes=rowsFromTable(otherTypes);
    state.days=rowsFromTable(days);
    state.hours=rowsFromTable(hours);
    state.parameters=rowsFromTable(parameters);

    fillSelectors();
    await loadAssociationLogo();
    await render();
  }catch(error){
    $('status').textContent='Erreur de chargement';
    $('errorText').textContent=error.stack||error.message||String(error);
    $('errorDialog').showModal();
  }
}

function setFormat(format){
  state.format=format;
  document.body.classList.toggle('print-a4',format==='a4');
  document.body.classList.toggle('print-a3',format==='a3');
  $('formatA4').classList.toggle('active',format==='a4');
  $('formatA3').classList.toggle('active',format==='a3');
  let style=$('dynamicPageStyle');
  if(!style){ style=document.createElement('style'); style.id='dynamicPageStyle'; document.head.appendChild(style); }
  style.textContent=`@page{size:${format.toUpperCase()} landscape;margin:6mm}`;
}

function bindEvents(){
  ['personSelect','practitionerSelect','typeKine','typeOrtho','filterCkpsp','filterGrillon','filterCabinet'].forEach(id=>$(id).addEventListener('change',render));
  $('formatA4').addEventListener('click',()=>setFormat('a4'));
  $('formatA3').addEventListener('click',()=>setFormat('a3'));
  $('printBtn').addEventListener('click',()=>{setFormat(state.format);requestAnimationFrame(()=>window.print());});
  $('reloadBtn').addEventListener('click',loadData);
}

bindEvents();
setFormat('a4');

grist.ready({requiredAccess:'full',columns:[]});
grist.onRecords(()=>loadData());
grist.onRecord(()=>loadData());
setTimeout(()=>loadData(),250);
