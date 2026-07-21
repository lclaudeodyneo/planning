'use strict';

const TABLES = {
  participations: 'Participations',
  activites: 'Activites',
  usagers: 'Usagers',
  jours: 'Jours_de_la_semaine',
  heures: 'Heures',
  animateurs: 'Animateurs'
};

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

const state = {
  tables: {},
  people: [],
  activities: [],
  selectedId: null,
  attachmentUrls: new Map()
};

const $ = (id) => document.getElementById(id);

function rowsFromTable(table) {
  if (!table || !Array.isArray(table.id)) return [];
  return table.id.map((id, i) =>
    Object.fromEntries(
      Object.entries(table).map(([k, v]) => [k, Array.isArray(v) ? v[i] : v])
    )
  );
}

function refIds(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value[0] === 'L' ? value.slice(1).filter(Number.isFinite) : value.filter(Number.isFinite);
  return Number.isFinite(value) ? [value] : [];
}

function byId(rows) {
  return new Map(rows.map(r => [r.id, r]));
}

function text(v, fallback = '') {
  return v == null || v === '' ? fallback : String(v);
}

function normalizeDay(v) {
  const s = text(v).trim().toLowerCase();
  return DAYS.find(d => d.toLowerCase() === s) || text(v, 'Jour');
}

function minutes(v) {
  const m = text(v).match(/(\d{1,2})\D(\d{2})/);
  return m ? (+m[1] * 60 + +m[2]) : 9999;
}

function initials(name) {
  return text(name, '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
}

function colorFor(name) {
  let h = 0;
  for (const c of text(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 48% 48%)`;
}

function esc(s) {
  return text(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

let attachmentTokenInfo = null;

async function attachmentUrl(value) {
  const ids = refIds(value);

  if (!ids.length) {
    return '';
  }

  const id = ids[0];

  if (state.attachmentUrls.has(id)) {
    return state.attachmentUrls.get(id);
  }

  try {
    if (!attachmentTokenInfo) {
      attachmentTokenInfo = await grist.docApi.getAccessToken({
        readOnly: true
      });
    }

    const url =
      `${attachmentTokenInfo.baseUrl}/attachments/${id}/download` +
      `?auth=${encodeURIComponent(attachmentTokenInfo.token)}`;

    state.attachmentUrls.set(id, url);

    return url;
  } catch (error) {
    console.error(
      `Impossible de charger la pièce jointe ${id}`,
      error
    );

    return '';
  }
}

async function fetchAll() {
  showStatus('Lecture des tables Grist…');
  const entries = await Promise.all(
    Object.entries(TABLES).map(async ([key, name]) => [key, await grist.docApi.fetchTable(name)])
  );
  state.tables = Object.fromEntries(entries.map(([k, t]) => [k, rowsFromTable(t)]));
  buildModel();
  populatePeople();
  const first = state.people[0];
  if (first) {
    state.selectedId = first.id;
    $('personSelect').value = String(first.id);
    await render();
  } else {
    showStatus('Aucun usager trouvé dans la table Usagers.', true);
  }
}

function buildModel() {
  const users = state.tables.usagers;
  const acts = state.tables.activites;
  const parts = state.tables.participations;
  const days = byId(state.tables.jours);
  const hours = byId(state.tables.heures);
  const anims = byId(state.tables.animateurs);

  const participantsByActivity = new Map();
  for (const p of parts) {
    const activityId = refIds(p.Activites)[0];
    if (!activityId) continue;
    const set = participantsByActivity.get(activityId) || new Set();
    refIds(p.Participants).forEach(id => set.add(id));
    participantsByActivity.set(activityId, set);
  }

  state.people = users
    .map(u => ({
      id: u.id,
      name: text(u.Usager, `${text(u.Prenom)} ${text(u.Nom)}`.trim()),
      portrait: u.Portrait,
      presence: refIds(u.Presence).map(id => normalizeDay(days.get(id)?.Jour)),
      flags: {
        Lundi: u.Lu,
        Mardi: u.Ma,
        Mercredi: u.Me,
        Jeudi: u.Je,
        Vendredi: u.Ve
      }
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  state.activities = acts
    .map(a => {
      const dayRow = days.get(refIds(a.Jour)[0]);
      const startRow = hours.get(refIds(a.Heure_debut)[0]);
      const endRow = hours.get(refIds(a.Heure_fin)[0]);
      const animatorNames = refIds(a.Animateur_s)
        .map(id => anims.get(id))
        .filter(Boolean)
        .map(x => text(x.Nom2, `${text(x.Prenom)} ${text(x.Nom)}`.trim()));

      return {
        id: a.id,
        name: text(a.Nom_activite, 'Activité'),
        day: normalizeDay(dayRow?.Jour || a.gristHelper_Display2),
        dayOrder: +(a.Jour_Num_jour || dayRow?.Num_jour || 99),
        start: text(startRow?.Heures || a.gristHelper_Display3),
        end: text(endRow?.Heures || a.gristHelper_Display4),
        animators: animatorNames,
        capacity: a.Capacite,
        description: text(a.Description),
        visual: a.Visuel,
        participants: participantsByActivity.get(a.id) || new Set()
      };
    })
    .sort((a, b) =>
      a.dayOrder - b.dayOrder ||
      minutes(a.start) - minutes(b.start) ||
      a.name.localeCompare(b.name, 'fr')
    );
}

function populatePeople() {
  $('personSelect').innerHTML = state.people
    .map(p => `<option value="${p.id}">${esc(p.name)}</option>`)
    .join('');
}

function showStatus(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
  $('status').classList.remove('hidden');
  $('sheet').classList.add('hidden');
}

function periodOf(a) {
  return minutes(a.start) < 13 * 60 ? 'Matin' : 'Après-midi';
}

function isPresent(person, day) {
  return person.presence.includes(day) || person.flags[day] === true || person.flags[day] === 1;
}

async function render() {
  const person = state.people.find(p => p.id === Number(state.selectedId));
  if (!person) return;

  $('status').classList.add('hidden');
  $('sheet').classList.remove('hidden');
  $('personName').textContent = person.name;

  const presentDays = DAYS.filter(d => isPresent(person, d));
  $('presenceText').textContent = presentDays.length
    ? `Présence habituelle : ${presentDays.join(', ')}`
    : 'Présence habituelle non renseignée';

  const purl = await attachmentUrl(person.portrait);
  $('portrait').innerHTML = purl
    ? `<img src="${esc(purl)}" alt="Portrait de ${esc(person.name)}">`
    : `<span>${esc(initials(person.name))}</span>`;

  const cards = await Promise.all(DAYS.map(day => renderDay(person, day)));
  $('weekGrid').innerHTML = cards.join('');
}

async function renderDay(person, day) {
  const activities = state.activities.filter(a => a.day === day && a.participants.has(person.id));
  const groups = {
    'Matin': activities.filter(a => periodOf(a) === 'Matin'),
    'Après-midi': activities.filter(a => periodOf(a) === 'Après-midi')
  };
  const showEmpty = $('showEmpty').checked;
  const sections = [];

  for (const label of ['Matin', 'Après-midi']) {
    const list = groups[label];
    if (!list.length && !showEmpty) continue;

    const inner = list.length
      ? (await Promise.all(list.map(activityCard))).join('')
      : `<div class="empty-slot">${isPresent(person, day) ? 'Aucune activité renseignée' : 'Non présent'}</div>`;

    sections.push(
      `<section class="period"><div class="period-title"><i class="dot ${label === 'Matin' ? 'morning' : 'afternoon'}"></i>${label}</div>${inner}</section>`
    );
  }

  return `<article class="day"><header class="day-head"><h3>${day}</h3><span>${activities.length} activité${activities.length > 1 ? 's' : ''}</span></header>${sections.join('')}</article>`;
}

async function activityCard(a) {
  const logo = await attachmentUrl(a.visual);
  const time = [a.start, a.end].filter(Boolean).join(' – ');

  return `<div class="activity-card" style="--card-color:${colorFor(a.name)}">
    ${logo ? `<img class="activity-logo" src="${esc(logo)}" alt="">` : ''}
    <h4 class="activity-title">${esc(a.name)}</h4>
    ${time ? `<span class="activity-time">${esc(time)}</span>` : ''}
    <div class="activity-meta">
      ${a.animators.length ? `<div><strong>Animateur${a.animators.length > 1 ? 's' : ''} :</strong> ${esc(a.animators.join(', '))}</div>` : ''}
      ${a.capacity ? `<div><strong>Capacité :</strong> ${esc(a.capacity)}</div>` : ''}
    </div>
    ${a.description ? `<p class="activity-desc">${esc(a.description)}</p>` : ''}
  </div>`;
}

function showError(err) {
  console.error(err);
  showStatus('Une erreur empêche l’affichage du planning.', true);
  $('errorText').textContent =
    `${err?.message || err}\n\nVérifiez que les tables portent exactement ces noms :\n${Object.values(TABLES).join('\n')}`;
  $('errorDialog').showModal();
}

$('personSelect').addEventListener('change', e => {
  state.selectedId = Number(e.target.value);
  render().catch(showError);
});

$('showEmpty').addEventListener('change', () => {
  render().catch(showError);
});

$('formatSelect').addEventListener('change', e => {
  document.body.classList.toggle('print-a3', e.target.value === 'a3');
});

$('printBtn').addEventListener('click', () => {
  window.print();
});

$('reloadBtn').addEventListener('click', () => {
  fetchAll().catch(showError);
});

grist.ready({ requiredAccess: 'full' });

grist.onOptions((_options, interaction) => {
  if (interaction?.access_level && interaction.access_level !== 'full') {
    showStatus('Autorisez « Accès complet au document » pour lire les tables liées.', true);
  }
});

fetchAll().catch(showError);