'use strict';

const DAYS = [
  {name:'Lundi', short:'Lu', color:'#7A4DA3'},
  {name:'Mardi', short:'Ma', color:'#2F80A8'},
  {name:'Mercredi', short:'Me', color:'#348B68'},
  {name:'Jeudi', short:'Je', color:'#D1842C'},
  {name:'Vendredi', short:'Ve', color:'#B64B5D'}
];
const DEFAULT_OPACITY = 0.12;
const TABLES = {
  activities:'Activites', otherTypes:'Activites_autres', reeducations:'Reeducations',
  partners:'Reeducateurs', participation:'Participations', users:'Usagers',
  days:'Jours_de_la_semaine', hours:'Heures', animateurs:'Animateurs'
};
let state = {activities:[], otherTypes:[], reeducations:[], partners:[], participations:[], users:[], days:[], hours:[], animateurs:[]};
let attachmentTokenInfo = null;
const attachmentCache = new Map();

const normalize = v => String(v ?? '').trim();
const get = (row,...names) => { for(const n of names) if(row && row[n] !== undefined && row[n] !== null && row[n] !== '') return row[n]; return ''; };
const rowsFromTable = table => !table || !Array.isArray(table.id) ? [] : table.id.map((id,i)=>Object.fromEntries(Object.entries(table).map(([k,v])=>[k,Array.isArray(v)?v[i]:v]).concat([['id',id]])));
const listIds = value => Array.isArray(value) ? (value[0] === 'L' ? value.slice(1) : value).map(Number).filter(Number.isFinite) : (Number.isFinite(Number(value)) && Number(value)!==0 ? [Number(value)] : []);
const firstId = value => listIds(value)[0] ?? null;
const byId = rows => new Map(rows.map(r=>[r.id,r]));

function minutes(value){ const m=normalize(value).match(/(\d{1,2})\s*[:h]\s*(\d{2})/i); return m?Number(m[1])*60+Number(m[2]):9999; }
function formatTime(value){ return normalize(value).replace(/h/i,':'); }
function refText(value, rows, names){ const row=byId(rows).get(firstId(value)); return row?normalize(get(row,...names)):normalize(value); }
function userName(u){ return normalize(get(u,'Usager')) || `${normalize(get(u,'Prenom','Prénom'))} ${normalize(get(u,'Nom')).toUpperCase()}`.trim(); }
function dayName(row){ return normalize(get(row,'gristHelper_Display2')) || refText(get(row,'Jour'),state.days,['Jour']); }
function hourText(row){ return normalize(get(row,'gristHelper_Display3')) || refText(get(row,'Horaire','Heure_debut'),state.hours,['Heures']); }
function activityHour(row,start=true){ return normalize(get(row,start?'gristHelper_Display3':'gristHelper_Display4')) || refText(get(row,start?'Heure_debut':'Heure_fin'),state.hours,['Heures']); }
function opacity(day){ return Number(localStorage.getItem(`planning-opacity-${day.short}`) ?? DEFAULT_OPACITY); }
function hexToRgba(hex,alpha){ const h=hex.replace('#',''); const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`; }
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

async function attachmentUrl(value){
  const id=listIds(value)[0]; if(!id) return '';
  if(attachmentCache.has(id)) return attachmentCache.get(id);
  try{
    if(!attachmentTokenInfo) attachmentTokenInfo=await grist.docApi.getAccessToken({readOnly:true});
    const url=`${attachmentTokenInfo.baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(attachmentTokenInfo.token)}`;
    attachmentCache.set(id,url); return url;
  }catch(e){ console.error('Pièce jointe inaccessible',id,e); return ''; }
}

function presenceDays(user){
  const refs=listIds(get(user,'Presence'));
  if(refs.length) return refs.map(id=>normalize(byId(state.days).get(id)?.Jour)).filter(Boolean);
  return DAYS.filter(d=>Boolean(get(user,d.short))).map(d=>d.name);
}
function isPresent(user,day){ return presenceDays(user).includes(day.name); }

function buildStandardItems(user){
  const activityIds=new Set();
  state.participations.forEach(p=>{ if(listIds(get(p,'Participants')).includes(user.id)){ const id=firstId(get(p,'Activites')); if(id) activityIds.add(id); }});
  return state.activities.filter(a=>activityIds.has(a.id)).map(a=>({
    kind:'standard',day:dayName(a),start:activityHour(a,true),end:activityHour(a,false),
    title:normalize(get(a,'Nom_activite'))||'Activité',type:'Activité',visual:get(a,'Visuel'),
    partner:normalize(get(a,'gristHelper_Display'))||refText(get(a,'Animateur_s'),state.animateurs,['Nom2','Nom']),
    location:normalize(get(a,'Salle','Lieu')),notes:normalize(get(a,'Remarques_planning'))
  }));
}

function buildOtherItems(user){
  const types=byId(state.otherTypes), partners=byId(state.partners);
  return state.reeducations.filter(r=>firstId(get(r,'Usagers'))===user.id).map(r=>{
    const type=types.get(firstId(get(r,'Type')))||{};
    const partner=partners.get(firstId(get(r,'Partenaire')))||{};
    const title=normalize(get(type,'Type'))||normalize(get(r,'gristHelper_Display6'))||'Activité autre';
    return {
      kind:'other',day:dayName(r),start:hourText(r),end:'',title,type:title,
      visual:get(type,'Visuel_act_autre'),
      partner:normalize(get(partner,'Partenaire'))||normalize(get(r,'gristHelper_Display4')),
      location:normalize(get(r,'Lieu')),notes:''
    };
  }).filter(x=>x.day);
}

async function makeCard(item,color){
  const el=document.createElement('article'); el.className=`activity-card ${item.kind==='other'?'other-activity':''}`; el.style.setProperty('--card-color',color);
  const visual=document.createElement('div'); visual.className='activity-visual';
  const url=await attachmentUrl(item.visual);
  if(url){ const img=document.createElement('img'); img.src=url; img.alt=`Pictogramme ${item.title}`; img.onerror=()=>visual.classList.add('visual-fallback'); visual.appendChild(img); }
  else { visual.classList.add('visual-fallback'); visual.textContent=item.title.slice(0,1).toUpperCase(); }
  el.appendChild(visual);
  const content=document.createElement('div'); content.className='activity-content';
  content.innerHTML=`<div class="activity-title">${escapeHtml(item.title)}</div>`;
  const time=item.start&&item.end?`${item.start} – ${item.end}`:(item.start||item.end||'Horaire non renseigné');
  const details=document.createElement('div'); details.className='activity-details';
  details.innerHTML=`<div class="detail-line"><span class="detail-picto" aria-hidden="true">🕒</span><strong>${escapeHtml(time)}</strong></div>`+
    (item.partner?`<div class="detail-line"><span class="detail-picto" aria-hidden="true">👤</span>${escapeHtml(item.partner)}</div>`:'')+
    (item.location?`<div class="detail-line"><span class="detail-picto" aria-hidden="true">📍</span>${escapeHtml(item.location)}</div>`:'');
  content.appendChild(details);
  if(item.notes){ const note=document.createElement('p'); note.className='activity-desc'; note.textContent=item.notes.slice(0,100); content.appendChild(note); }
  el.appendChild(content); return el;
}
function mealSeparator(){ const d=document.createElement('div'); d.className='meal-separator'; d.innerHTML='<span>12 h · Repas</span>'; return d; }

async function render(){
  const select=document.getElementById('personSelect');
  const user=state.users.find(u=>String(u.id)===select.value)||state.users[0];
  const week=document.getElementById('week'); week.innerHTML=''; if(!user) return;
  document.getElementById('personName').textContent=userName(user);
  const days=presenceDays(user);
  document.getElementById('presenceText').textContent=`Jours de présence : ${days.length?days.join(' · '):'aucun jour renseigné'}`;
  const portrait=document.getElementById('portrait'); portrait.innerHTML='';
  const purl=await attachmentUrl(get(user,'Portrait'));
  if(purl){ const im=document.createElement('img'); im.src=purl; im.alt=`Portrait de ${userName(user)}`; im.onerror=()=>{portrait.textContent=userName(user).split(/\s+/).map(x=>x[0]).slice(0,2).join('');}; portrait.appendChild(im); }
  else portrait.textContent=userName(user).split(/\s+/).map(x=>x[0]).slice(0,2).join('');

  const all=[...buildStandardItems(user),...buildOtherItems(user)];
  for(const day of DAYS){
    const section=document.createElement('section'); section.className='day'; section.style.setProperty('--day-color',day.color); section.style.setProperty('--day-soft',hexToRgba(day.color,opacity(day)));
    const present=isPresent(user,day); if(!present) section.classList.add('absent');
    const head=document.createElement('header'); head.className='day-head'; head.innerHTML=`<h3>${day.name}</h3><span>${present?'Présent':'ABSENT'}</span>`; section.appendChild(head);
    const body=document.createElement('div'); body.className='day-body';
    const items=all.filter(x=>normalize(x.day).toLowerCase()===day.name.toLowerCase()).sort((a,b)=>minutes(a.start)-minutes(b.start));
    const morning=items.filter(x=>minutes(x.start)<720), evening=items.filter(x=>minutes(x.start)>=720);
    for(const [label,arr,cls] of [['Matin',morning,'morning-period'],['Soir',evening,'evening-period']]){
      if(label==='Soir') body.appendChild(mealSeparator());
      const period=document.createElement('div'); period.className=`period ${cls}`;
      const title=document.createElement('div'); title.className='period-title'; title.textContent=label; period.appendChild(title);
      if(arr.length){ for(const item of arr) period.appendChild(await makeCard(item,day.color)); }
      else if(document.getElementById('showEmpty').checked){ const e=document.createElement('div'); e.className='empty-slot'; e.textContent='Aucune activité'; period.appendChild(e); }
      body.appendChild(period);
    }
    section.appendChild(body); week.appendChild(section);
  }
}

function refreshPeople(){ const select=document.getElementById('personSelect'),old=select.value; select.innerHTML=''; state.users.sort((a,b)=>userName(a).localeCompare(userName(b),'fr')).forEach(u=>{const o=document.createElement('option');o.value=String(u.id);o.textContent=userName(u);select.appendChild(o);}); if([...select.options].some(o=>o.value===old))select.value=old; render(); }
async function load(){
  try{
    document.getElementById('status').classList.remove('hidden'); attachmentTokenInfo=null; attachmentCache.clear();
    const entries=await Promise.all(Object.entries(TABLES).map(async([key,name])=>{try{return [key,rowsFromTable(await grist.docApi.fetchTable(name))];}catch(e){console.warn(name,e);return [key,[]];}}));
    state=Object.fromEntries(entries);
    if(!state.users.length) throw new Error('La table Usagers est vide ou inaccessible.');
    refreshPeople(); document.getElementById('status').classList.add('hidden'); document.getElementById('sheet').classList.remove('hidden');
  }catch(e){ document.getElementById('status').textContent='Erreur de chargement'; document.getElementById('errorText').textContent=e.stack||e.message; document.getElementById('errorDialog').showModal(); }
}
function setupOpacity(){ const box=document.getElementById('opacityControls'); box.innerHTML=''; DAYS.forEach(day=>{const row=document.createElement('label');row.className='opacity-row';row.innerHTML=`<span style="--swatch:${day.color}">${day.name}</span><input type="range" min="0" max="0.45" step="0.01" value="${opacity(day)}"><output>${Math.round(opacity(day)*100)} %</output>`;const input=row.querySelector('input'),out=row.querySelector('output');input.oninput=()=>{localStorage.setItem(`planning-opacity-${day.short}`,input.value);out.textContent=`${Math.round(input.value*100)} %`;render();};box.appendChild(row);}); }

document.getElementById('personSelect').onchange=render;
document.getElementById('showEmpty').onchange=render;
document.getElementById('printButton').onclick=()=>window.print();
document.getElementById('refreshButton').onclick=load;
document.getElementById('printFormat').onchange=e=>document.body.classList.toggle('print-a3',e.target.value==='a3');
document.getElementById('opacityButton').onclick=()=>{setupOpacity();document.getElementById('opacityDialog').showModal();};
document.getElementById('resetOpacity').onclick=()=>{DAYS.forEach(d=>localStorage.removeItem(`planning-opacity-${d.short}`));setupOpacity();render();};
grist.ready({requiredAccess:'read table'}); load();
