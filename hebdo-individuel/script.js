'use strict';

const TABLES = {
  participations: 'Participations',
  activites: 'Activites',
  usagers: 'Usagers',
  jours: 'Jours_de_la_semaine',
  heures: 'Heures',
  animateurs: 'Animateurs',
  activitesAutres: 'Activites_autres',
  reeducations: 'Reeducations',
  reeducateurs: 'Reeducateurs'
};

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

const DAY_COLORS = {
  Lundi: '#5b8def',
  Mardi: '#55a868',
  Mercredi: '#c77cff',
  Jeudi: '#e6a23c',
  Vendredi: '#e66b6b'
};

const state = {
  tables: {},
  people: [],
  activities: [],
  otherActivities: [],
  selectedId: null,
  attachmentUrls: new Map()
};

const $ = (id) => document.getElementById(id);

function rowsFromTable(table) {
  if (!table || !Array.isArray(table.id)) {
    return [];
  }

  return table.id.map((id, index) => Object.fromEntries(
    Object.entries(table).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[index] : value
    ])
  ));
}

function refIds(value) {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value[0] === 'L'
      ? value.slice(1).filter(Number.isFinite)
      : value.filter(Number.isFinite);
  }

  return Number.isFinite(value) ? [value] : [];
}

function byId(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

function text(value, fallback = '') {
  return value == null || value === '' ? fallback : String(value);
}

function normalizeDay(value) {
  const normalized = text(value).trim().toLowerCase();
  return DAYS.find((day) => day.toLowerCase() === normalized) || text(value, 'Jour');
}

function minutes(value) {
  const match = text(value).match(/(\d{1,2})\D(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 9999;
}

function initials(name) {
  return text(name, '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function colorFor(name) {
  let hue = 0;

  for (const character of text(name)) {
    hue = (hue * 31 + character.charCodeAt(0)) % 360;
  }

  return `hsl(${hue} 48% 48%)`;
}

function esc(value) {
  return text(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[character]);
}

function firstDefined(row, columnNames, fallback = '') {
  for (const columnName of columnNames) {
    if (row && row[columnName] != null && row[columnName] !== '') {
      return row[columnName];
    }
  }

  return fallback;
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
      attachmentTokenInfo = await grist.docApi.getAccessToken({ readOnly: true });
    }

    const url =
      `${attachmentTokenInfo.baseUrl}/attachments/${id}/download` +
      `?auth=${encodeURIComponent(attachmentTokenInfo.token)}`;

    state.attachmentUrls.set(id, url);
    return url;
  } catch (error) {
    console.error(`Impossible de charger la pièce jointe ${id}`, error);
    return '';
  }
}

async function fetchAll() {
  showStatus('Lecture des tables Grist…');

  const entries = await Promise.all(
    Object.entries(TABLES).map(async ([key, name]) => [
      key,
      await grist.docApi.fetchTable(name)
    ])
  );

  state.tables = Object.fromEntries(
    entries.map(([key, table]) => [key, rowsFromTable(table)])
  );

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
  const activities = state.tables.activites;
  const participations = state.tables.participations;
  const days = byId(state.tables.jours);
  const hours = byId(state.tables.heures);
  const animators = byId(state.tables.animateurs);
  const otherActivityTypes = byId(state.tables.activitesAutres);
  const partners = byId(state.tables.reeducateurs);

  const participantsByActivity = new Map();

  for (const participation of participations) {
    const activityId = refIds(participation.Activites)[0];

    if (!activityId) {
      continue;
    }

    const participantSet = participantsByActivity.get(activityId) || new Set();

    refIds(participation.Participants).forEach((participantId) => {
      participantSet.add(participantId);
    });

    participantsByActivity.set(activityId, participantSet);
  }

  state.people = users
    .map((user) => ({
      id: user.id,
      name: text(
        user.Usager,
        `${text(user.Prenom)} ${text(user.Nom)}`.trim()
      ),
      portrait: user.Portrait,
      presence: refIds(user.Presence).map((id) => normalizeDay(days.get(id)?.Jour)),
      flags: {
        Lundi: user.Lu,
        Mardi: user.Ma,
        Mercredi: user.Me,
        Jeudi: user.Je,
        Vendredi: user.Ve
      }
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  state.activities = activities
    .map((activity) => {
      const dayRow = days.get(refIds(activity.Jour)[0]);
      const startRow = hours.get(refIds(activity.Heure_debut)[0]);
      const endRow = hours.get(refIds(activity.Heure_fin)[0]);

      const animatorNames = refIds(activity.Animateur_s)
        .map((id) => animators.get(id))
        .filter(Boolean)
        .map((animator) => text(
          animator.Nom2,
          `${text(animator.Prenom)} ${text(animator.Nom)}`.trim()
        ));

      return {
        id: activity.id,
        kind: 'regular',
        name: text(activity.Nom_activite, 'Activité'),
        day: normalizeDay(dayRow?.Jour || activity.gristHelper_Display2),
        dayOrder: Number(activity.Jour_Num_jour || dayRow?.Num_jour || 99),
        start: text(startRow?.Heures || activity.gristHelper_Display3),
        end: text(endRow?.Heures || activity.gristHelper_Display4),
        animators: animatorNames,
        capacity: activity.Capacite,
        description: text(activity.Remarques_planning).slice(0, 100),
        visual: activity.Visuel,
        participants: participantsByActivity.get(activity.id) || new Set()
      };
    })
    .sort(sortActivities);

  state.otherActivities = state.tables.reeducations
    .map((otherActivity) => {
      const typeRow = otherActivityTypes.get(refIds(otherActivity.Type)[0]);
      const dayRow = days.get(refIds(otherActivity.Jour)[0]);
      const partnerRow = partners.get(refIds(otherActivity.Partenaire)[0]);
      const userIds = refIds(otherActivity.Usagers);

      const typeName = text(
        typeRow?.Type || otherActivity.gristHelper_Display,
        'Activité autre'
      );

      const partnerName = text(
        partnerRow?.Partenaire ||
        partnerRow?.Organisation ||
        otherActivity.gristHelper_Display4 ||
        otherActivity.gristHelper_Display6
      );

      const rawSchedule = text(
        firstDefined(otherActivity, ['Horaire', 'gristHelper_Display3'])
      );

      const scheduleParts = rawSchedule
        .split(/\s*[–—-]\s*/)
        .filter(Boolean);

      return {
        id: otherActivity.id,
        kind: 'other',
        name: typeName,
        day: normalizeDay(dayRow?.Jour || otherActivity.gristHelper_Display2),
        dayOrder: Number(dayRow?.Num_jour || 99),
        start: scheduleParts[0] || rawSchedule,
        end: scheduleParts[1] || '',
        schedule: rawSchedule,
        partner: partnerName,
        place: text(otherActivity.Lieu),
        description: '',
        visual: typeRow?.Visuel_act_autre,
        participants: new Set(userIds)
      };
    })
    .sort(sortActivities);
}

function sortActivities(a, b) {
  return (
    a.dayOrder - b.dayOrder ||
    minutes(a.start) - minutes(b.start) ||
    a.name.localeCompare(b.name, 'fr')
  );
}

function populatePeople() {
  $('personSelect').innerHTML = state.people
    .map((person) => `<option value="${person.id}">${esc(person.name)}</option>`)
    .join('');
}

function showStatus(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
  $('status').classList.remove('hidden');
  $('sheet').classList.add('hidden');
}

function periodOf(activity) {
  return minutes(activity.start) < 13 * 60 ? 'Matin' : 'Soir';
}

function isPresent(person, day) {
  return (
    person.presence.includes(day) ||
    person.flags[day] === true ||
    person.flags[day] === 1
  );
}

function opacityFor(day) {
  const input = $(`opacity${day}`);
  const value = input ? Number(input.value) : 18;
  return Math.min(100, Math.max(0, value)) / 100;
}

function hexToRgba(hex, opacity) {
  const normalized = hex.replace('#', '');
  const number = Number.parseInt(normalized, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

async function render() {
  const person = state.people.find((item) => item.id === Number(state.selectedId));

  if (!person) {
    return;
  }

  $('status').classList.add('hidden');
  $('sheet').classList.remove('hidden');
  $('personName').textContent = person.name;

  const presentDays = DAYS.filter((day) => isPresent(person, day));

  $('presenceText').textContent = presentDays.length
    ? presentDays.join(', ')
    : 'Présence habituelle non renseignée';

  const portraitUrl = await attachmentUrl(person.portrait);

  $('portrait').innerHTML = portraitUrl
    ? `<img src="${portraitUrl}" alt="Portrait de ${esc(person.name)}">`
    : `<span>${esc(initials(person.name))}</span>`;

  const cards = await Promise.all(
    DAYS.map((day) => renderDay(person, day))
  );

  $('weekGrid').innerHTML = cards.join('');
}

async function renderDay(person, day) {
  const regularActivities = state.activities.filter((activity) => (
    activity.day === day && activity.participants.has(person.id)
  ));

  const otherActivities = state.otherActivities.filter((activity) => (
    activity.day === day && activity.participants.has(person.id)
  ));

  const activities = [...regularActivities, ...otherActivities].sort(sortActivities);

  const groups = {
    Matin: activities.filter((activity) => periodOf(activity) === 'Matin'),
    Soir: activities.filter((activity) => periodOf(activity) === 'Soir')
  };

  const showEmpty = $('showEmpty').checked;
  const present = isPresent(person, day);
  const sections = [];

  for (const label of ['Matin', 'Soir']) {
    const list = groups[label];

    if (!list.length && !showEmpty) {
      continue;
    }

    const inner = list.length
      ? (await Promise.all(list.map(activityCard))).join('')
      : `<div class="empty-slot">${present ? 'Aucune activité renseignée' : 'Non présent'}</div>`;

    sections.push(`
      <section class="period period-${label.toLowerCase()}">
        <div class="period-title">${label}</div>
        ${inner}
      </section>
    `);

    if (label === 'Matin') {
      sections.push(`
        <div class="meal-separator" aria-label="Repas de 12 heures">
          <span>12 h · Repas</span>
        </div>
      `);
    }
  }

  const dayColor = DAY_COLORS[day];
  const dayBackground = hexToRgba(dayColor, opacityFor(day));
  const absenceClass = present ? '' : ' day-absent';

  return `
    <article
      class="day${absenceClass}"
      style="--day-color: ${dayColor}; --day-background: ${dayBackground};"
    >
      <div class="day-head">
        <h3>${day}</h3>
        <span>${present ? `${activities.length} activité${activities.length > 1 ? 's' : ''}` : 'ABSENT'}</span>
      </div>
      <div class="day-content">
        ${sections.join('')}
      </div>
    </article>
  `;
}

async function activityCard(activity) {
  const logo = await attachmentUrl(activity.visual);
  const time = activity.schedule || [activity.start, activity.end].filter(Boolean).join(' – ');
  const cardColor = colorFor(activity.name);

  const regularMeta = activity.kind === 'regular' && activity.animators.length
    ? `
      <div>
        <strong>Animateur${activity.animators.length > 1 ? 's' : ''} :</strong>
        ${esc(activity.animators.join(', '))}
      </div>
    `
    : '';

  const otherMeta = activity.kind === 'other'
    ? `
      ${activity.partner ? `<div><strong>Partenaire :</strong> ${esc(activity.partner)}</div>` : ''}
      ${activity.place ? `<div><strong>Lieu :</strong> ${esc(activity.place)}</div>` : ''}
    `
    : '';

  return `
    <article class="activity-card${activity.kind === 'other' ? ' activity-card-other' : ''}" style="--card-color: ${cardColor}">
      ${logo ? `<img class="activity-logo" src="${logo}" alt="">` : ''}
      <h4 class="activity-title">${esc(activity.name)}</h4>
      ${time ? `<div class="activity-time">${esc(time)}</div>` : ''}
      <div class="activity-meta">
        ${regularMeta}
        ${otherMeta}
      </div>
      ${activity.description ? `<p class="activity-desc">${esc(activity.description.slice(0, 100))}</p>` : ''}
    </article>
  `;
}

function showError(error) {
  console.error(error);
  showStatus('Une erreur empêche l’affichage du planning.', true);

  $('errorText').textContent =
    `${error?.message || error}\n\n` +
    'Vérifiez que les tables portent exactement ces noms :\n' +
    Object.values(TABLES).join('\n');

  $('errorDialog').showModal();
}

$('personSelect').addEventListener('change', (event) => {
  state.selectedId = Number(event.target.value);
  render().catch(showError);
});

$('showEmpty').addEventListener('change', () => {
  render().catch(showError);
});

$('formatSelect').addEventListener('change', (event) => {
  document.body.classList.toggle('print-a3', event.target.value === 'a3');
});

for (const day of DAYS) {
  $(`opacity${day}`).addEventListener('input', () => {
    render().catch(showError);
  });
}

$('printBtn').addEventListener('click', () => {
  window.print();
});

$('reloadBtn').addEventListener('click', () => {
  fetchAll().catch(showError);
});

grist.ready({ requiredAccess: 'full' });

grist.onOptions((_options, interaction) => {
  if (interaction?.access_level && interaction.access_level !== 'full') {
    showStatus(
      'Autorisez « Accès complet au document » pour lire les tables liées.',
      true
    );
  }
});

fetchAll().catch(showError);
