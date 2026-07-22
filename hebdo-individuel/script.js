const DAYS = [
  {name:'Lundi', short:'Lu', color:'#7A4DA3'},
  {name:'Mardi', short:'Ma', color:'#2F80A8'},
  {name:'Mercredi', short:'Me', color:'#348B68'},
  {name:'Jeudi', short:'Je', color:'#D1842C'},
  {name:'Vendredi', short:'Ve', color:'#B64B5D'}
];
const DEFAULT_OPACITY = 0.12;
const TABLES = {activities:'Activites', other:'Activites_autres', participation:'Participations', users:'Usagers'};
let state = {activities:[], others:[], participations:[], users:[]};
const normalize = v => String(v ?? '').trim();
const listIds = value => Array.isArray(value) ? (value[0] === 'L' ? value.slice(1) : value).map(Number).filter(Number.isFinite) : [];
const firstId = value => Number.isFinite(Number(value)) ? Number(value) : null;
const get = (row, ...names) => { for (const n of names) if (row && row[n] !== undefined && row[n] !== null && row[n] !== '') return row[n]; return ''; };
const rowsFromTable = table => {
  if (!table || !table.id) return [];
  return table.id.map((id, i) => Object.fromEntries(Object.entries(table).map(([k,v]) => [k, Array.isArray(v) ? v[i] : v]).concat([['id', id]])));
};
function minutes(value) {
  if (value === null || value === undefined || value === '') return 9999;
  if (typeof value === 'number') return value > 1440 ? Math.floor(value / 60) : value;
  const m = normalize(value).match(/(\d{1,2})\s*[:h]\s*(\d{2})/i);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9999;
}
function formatTime(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') { const t = value > 1440 ? Math.floor(value / 60) : value; return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`; }
  return normalize(value).replace(/h/i, ':');
}
function attachmentUrl(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^(https?:|data:|blob:)/i.test(value)) return value;
  const ids = Array.isArray(value) ? (value[0] === 'L' ? value.slice(1) : value) : [value];
  const id = ids.find(x => /^\d+$/.test(String(x)));
  return id ? `https://docs.getgrist.com/attachments/${id}/download` : '';
}
function refText(value, table, labelNames) {
  const id = firstId(value); const row = table.find(r => r.id === id);
  return row ? normalize(get(row, ...labelNames)) : normalize(value);
}
function userName(u) { return normalize(get(u,'Usager')) || `${normalize(get(u,'Prenom','Prénom'))} ${normalize(get(u,'Nom')).toUpperCase()}`.trim(); }
function activityName(a) { return normalize(get(a,'Nom_activite','Nom activité','Activite','Activité')) || 'Activité'; }
function dayName(row) {
  const raw = get(row,'Jour','Jour_affiche','gristHelper_Display2');
  if (typeof raw === 'number') return refText(raw, state.days || [], ['Jour']);
  return normalize(raw);
}
function hourText(row, start=true) {
  const raw = start ? get(row,'Heure_debut_affiche','gristHelper_Display3','Heure_debut','Debut','Début') : get(row,'Heure_fin_affiche','gristHelper_Display4','Heure_fin','Fin');
  if (typeof raw === 'number' && state.hours) return refText(raw, state.hours, ['Heures']);
  return formatTime(raw);
}
function opacity(day) { return Number(localStorage.getItem(`planning-opacity-${day.short}`) ?? DEFAULT_OPACITY); }
function hexToRgba(hex, alpha) { const h=hex.replace('#',''); const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`; }
function isPresent(user, day) {
  const flag = get(user, day.short);
  if (flag !== '') return Boolean(flag);
  const presence = get(user,'Presence','Présence','gristHelper_Display2');
  const names = Array.isArray(presence) ? presence.map(id => refText(id, state.days || [], ['Jour'])) : normalize(presence).split(/[,;]/);
  return names.some(x => normalize(x).toLowerCase() === day.name.toLowerCase());
}
function buildStandardItems(user) {
  const uid=user.id; const activityIds = new Set();
  state.participations.forEach(p => { if (listIds(get(p,'Participants')).includes(uid)) { const id=firstId(get(p,'Activites','Activités','Activite')); if(id) activityIds.add(id); } });
  return state.activities.filter(a => activityIds.has(a.id)).map(a => ({kind:'standard', day:dayName(a), start:hourText(a,true), end:hourText(a,false), title:activityName(a), type:'Activité', visual:get(a,'Visuel'), partner:normalize(get(a,'Animateur_s','Animateurs','Professionnel','gristHelper_Display')), location:normalize(get(a,'Salle','Lieu')), notes:normalize(get(a,'Remarques_planning','Notes'))}));
}
function buildOtherItems(user) {
  const uid=user.id;
  return state.others.filter(o => {
    const participants=listIds(get(o,'Participants','Usagers','Participant')); return !participants.length || participants.includes(uid);
  }).map(o => ({kind:'other', day:dayName(o), start:hourText(o,true), end:hourText(o,false), title:normalize(get(o,'Nom','Intitule','Intitulé','Type')) || 'Activité autre', type:normalize(get(o,'Type')) || 'Activité autre', visual:get(o,'Visuel_act_autre','Visuel'), partner:normalize(get(o,'Partenaire','Nom_partenaire','Professionnel','Intervenant')), location:normalize(get(o,'Lieu','Salle')), notes:normalize(get(o,'Remarques','Notes'))})).filter(x=>x.day);
}
function card(item, color) {
  const el=document.createElement('article'); el.className=`activity-card ${item.kind==='other'?'other-activity':''}`; el.style.setProperty('--card-color',color);
  const img=attachmentUrl(item.visual); if(img){const im=document.createElement('img'); im.src=img; im.className='activity-logo'; im.alt=`Visuel ${item.title}`; im.onerror=()=>im.remove(); el.appendChild(im);}
  const badge=document.createElement('div'); badge.className='activity-type'; badge.textContent=item.type; el.appendChild(badge);
  const title=document.createElement('div'); title.className='activity-title'; title.textContent=item.title; el.appendChild(title);
  const t=document.createElement('div'); t.className='activity-time'; t.textContent=item.start && item.end ? `${item.start} – ${item.end}` : (item.start || item.end || 'Horaire non renseigné'); el.appendChild(t);
  const lines=[]; if(item.partner) lines.push(`<strong>${item.kind==='other'?'Partenaire':'Avec'} :</strong> ${escapeHtml(item.partner)}`); if(item.location) lines.push(`<strong>Lieu :</strong> ${escapeHtml(item.location)}`);
  if(lines.length){const meta=document.createElement('div'); meta.className='activity-meta'; meta.innerHTML=lines.join('<br>'); el.appendChild(meta);} if(item.notes){const d=document.createElement('p'); d.className='activity-desc'; d.textContent=item.notes; el.appendChild(d);} return el;
}
function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function mealSeparator(){const d=document.createElement('div'); d.className='meal-separator'; d.innerHTML='<span>12 h · Repas</span>'; return d;}
function render() {
  const select=document.getElementById('personSelect'); const user=state.users.find(u=>String(u.id)===select.value) || state.users[0]; const week=document.getElementById('week'); week.innerHTML=''; if(!user) return;
  document.getElementById('personName').textContent=userName(user); const portrait=document.getElementById('portrait'); portrait.innerHTML=''; const purl=attachmentUrl(get(user,'Portrait')); if(purl){const im=document.createElement('img');im.src=purl;im.onerror=()=>portrait.textContent=userName(user).split(/\s+/).map(x=>x[0]).slice(0,2).join('');portrait.appendChild(im);}else portrait.textContent=userName(user).split(/\s+/).map(x=>x[0]).slice(0,2).join('');
  const all=[...buildStandardItems(user),...buildOtherItems(user)];
  DAYS.forEach(day=>{ const section=document.createElement('section'); section.className='day'; section.style.setProperty('--day-color',day.color); section.style.setProperty('--day-soft',hexToRgba(day.color,opacity(day))); const present=isPresent(user,day); if(!present)section.classList.add('absent');
    const head=document.createElement('header');head.className='day-head';head.innerHTML=`<h3>${day.name}</h3><span>${present?'Présent':'ABSENT'}</span>`;section.appendChild(head);
    const body=document.createElement('div');body.className='day-body'; const items=all.filter(x=>normalize(x.day).toLowerCase()===day.name.toLowerCase()).sort((a,b)=>minutes(a.start)-minutes(b.start)); const morning=items.filter(x=>minutes(x.start)<720), afternoon=items.filter(x=>minutes(x.start)>=720);
    const addPeriod=(arr,cls,icon,label)=>{const period=document.createElement('div');period.className=`period ${cls}`;period.innerHTML=`<div class="period-title" title="${label}" aria-label="${label}"><span>${icon}</span><span class="sr-only">${label}</span></div>`; if(arr.length)arr.forEach(i=>period.appendChild(card(i,day.color)));else if(document.getElementById('showEmpty').checked){const e=document.createElement('div');e.className='empty-slot';e.textContent='Aucune activité';period.appendChild(e);} body.appendChild(period);};
    addPeriod(morning,'morning-period','☀','Matin'); body.appendChild(mealSeparator()); addPeriod(afternoon,'afternoon-period','◐','Après-midi'); section.appendChild(body); week.appendChild(section);
  });
}
function refreshPeople(){const select=document.getElementById('personSelect');const old=select.value;select.innerHTML='';state.users.sort((a,b)=>userName(a).localeCompare(userName(b),'fr')).forEach(u=>{const o=document.createElement('option');o.value=String(u.id);o.textContent=userName(u);select.appendChild(o);}); if([...select.options].some(o=>o.value===old))select.value=old; render();}
async function load(){try{document.getElementById('status').classList.remove('hidden'); const names=[TABLES.activities,TABLES.other,TABLES.participation,TABLES.users,'Jours_de_la_semaine','Heures']; const results=await Promise.all(names.map(async n=>{try{return rowsFromTable(await grist.docApi.fetchTable(n));}catch(e){return []}})); [state.activities,state.others,state.participations,state.users,state.days,state.hours]=results; if(!state.users.length)throw new Error('La table Usagers est vide ou inaccessible.'); refreshPeople();document.getElementById('status').classList.add('hidden');document.getElementById('sheet').classList.remove('hidden');}catch(e){document.getElementById('status').textContent='Erreur de chargement';document.getElementById('status').classList.add('error');document.getElementById('errorText').textContent=e.stack||e.message;document.getElementById('errorDialog').showModal();}}
function setupOpacity(){const box=document.getElementById('opacityControls');box.innerHTML='';DAYS.forEach(day=>{const row=document.createElement('label');row.className='opacity-row';row.innerHTML=`<span style="--swatch:${day.color}">${day.name}</span><input type="range" min="0" max="0.45" step="0.01" value="${opacity(day)}"><output>${Math.round(opacity(day)*100)} %</output>`;const input=row.querySelector('input'),out=row.querySelector('output');input.oninput=()=>{localStorage.setItem(`planning-opacity-${day.short}`,input.value);out.textContent=`${Math.round(input.value*100)} %`;render();};box.appendChild(row);});}
document.getElementById('personSelect').onchange=render; document.getElementById('showEmpty').onchange=render; document.getElementById('printButton').onclick=()=>window.print(); document.getElementById('refreshButton').onclick=load; document.getElementById('printFormat').onchange=e=>document.body.classList.toggle('print-a3',e.target.value==='a3'); document.getElementById('opacityButton').onclick=()=>{setupOpacity();document.getElementById('opacityDialog').showModal();}; document.getElementById('resetOpacity').onclick=()=>{DAYS.forEach(d=>localStorage.removeItem(`planning-opacity-${d.short}`));setupOpacity();render();};
grist.ready({requiredAccess:'read table'}); load();
