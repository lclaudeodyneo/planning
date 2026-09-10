'use strict';

/* =========================================================
   PLANNING INDIVIDUEL SAJ ANAGALLIS
   Version impression A4 optimisée
   ========================================================= */

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

const REQUIRED_TABLES = [
  'participations',
  'activites',
  'usagers',
  'jours',
  'heures',
  'animateurs'
];

const OPTIONAL_TABLES = [
  'activitesAutres',
  'reeducations',
  'reeducateurs'
];

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

/* =========================================================
   OUTILS GÉNÉRAUX
   ========================================================= */

function rowsFromTable(table) {
  if (!table || !Array.isArray(table.id)) return [];

  return table.id.map((id, index) =>
    Object.fromEntries(
      Object.entries(table).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[index] : value
      ])
    )
  );
}

function isTrue(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value !== 'string') return false;

  return ['true', 'oui', 'yes', 'vrai'].includes(
    value.trim().toLowerCase()
  );
}

function refIds(value) {
  if (value == null || value === '') return [];

  if (Array.isArray(value)) {
    const values = value[0] === 'L' ? value.slice(1) : value;
    return values
      .map(Number)
      .filter(Number.isFinite);
  }

  const number = Number(value);
  return Number.isFinite(number) ? [number] : [];
}

function byId(rows) {
  return new Map(rows.map((row) => [Number(row.id), row]));
}

function text(value, fallback = '') {
  return value == null || value === '' ? fallback : String(value);
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

function requireElement(id) {
  const element = $(id);
  if (!element) {
    throw new Error(`Élément HTML obligatoire introuvable : #${id}`);
  }
  return element;
}

function onIfPresent(id, eventName, handler) {
  const element = $(id);
  if (element) element.addEventListener(eventName, handler);
}

/* =========================================================
   STYLES INJECTÉS — CORRECTIONS D'AFFICHAGE / IMPRESSION
   ========================================================= */

function ensureInjectedStyles() {
  if (document.getElementById('planning-print-fixes')) return;

  const style = document.createElement('style');
  style.id = 'planning-print-fixes';
  style.textContent = `
.day {
  background: var(--day-background, #f8fafc);
  border-color: rgba(0, 0, 0, 0.08);
}

.day-head {
  background: var(--day-color, #5b8def);
}

.day-content {
  min-height: 0;
  height: auto;
}

.meal-banner {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3d2c72;
  color: #fff;
  border-radius: 3px;
  font-weight: 800;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
}

.meal-banner span {
  display: block;
}

#sheet.print-preparing {
  visibility: visible;
}

@page {
  size: A4 landscape;
  margin: 5mm;
}

@media print {
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    width: auto !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .no-print,
  #status {
    display: none !important;
  }

  #app {
    padding: 0 !important;
  }

  .sheet {
    display: flex !important;
    flex-direction: column !important;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    overflow: hidden !important;
  }

  .sheet-head {
    flex: 0 0 auto !important;
    margin-bottom: 2.5mm !important;
    padding-bottom: 1.5mm !important;
    border-bottom-width: 1.1mm !important;
  }

  .identity {
    gap: 3mm !important;
  }

  .portrait {
    width: 15mm !important;
    height: 15mm !important;
    border-radius: 2.6mm !important;
    border-width: .5mm !important;
  }

  .sheet h2 {
    margin: 0 !important;
    font-size: 15pt !important;
    line-height: 1.03 !important;
  }

  .eyebrow {
    margin: 0 0 1mm !important;
    font-size: 6pt !important;
    letter-spacing: .12em !important;
  }

  .muted,
  #printDate {
    font-size: 6pt !important;
    line-height: 1.15 !important;
    margin-top: .7mm !important;
  }

  .legend {
    gap: 3mm !important;
    font-size: 6.2pt !important;
  }

  .dot {
    width: 2mm !important;
    height: 2mm !important;
    margin-right: .8mm !important;
  }

  .week-grid {
    position: relative !important;
    display: grid !important;
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    column-gap: 1.6mm !important;
    row-gap: 0 !important;
    align-items: start !important;
    width: 100% !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }

  .day {
    min-width: 0 !important;
    border-radius: 2mm !important;
    overflow: hidden !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .day-head {
    padding: 1.4mm 1.2mm !important;
  }

  .day-head h3 {
    font-size: 8.5pt !important;
    line-height: 1 !important;
  }

  .day-head span {
    font-size: 5.1pt !important;
    line-height: 1 !important;
  }

  .day-content {
    display: block !important;
    min-height: 0 !important;
    height: auto !important;
  }

  .period {
    padding: 1.15mm !important;
    min-height: 0 !important;
  }

  .period + .period {
    border-top-width: .35mm !important;
  }

  .period-title {
    margin-bottom: .9mm !important;
    font-size: 6pt !important;
    line-height: 1 !important;
    letter-spacing: .06em !important;
  }

  .activity-card {
    padding: 1.15mm !important;
    margin: 0 0 .95mm !important;
    border-left-width: 1.1mm !important;
    border-radius: 1.5mm !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .activity-card:last-child {
    margin-bottom: 0 !important;
  }

  .activity-title {
    margin: 0 0 .6mm !important;
    padding-right: 7mm !important;
    font-size: 7.2pt !important;
    line-height: 1.08 !important;
  }

  .activity-time {
    gap: .6mm !important;
    padding: .3mm .75mm !important;
    font-size: 5.8pt !important;
    line-height: 1 !important;
  }

  .activity-meta {
    margin-top: .7mm !important;
    font-size: 5.2pt !important;
    line-height: 1.14 !important;
  }

  .activity-desc {
    margin: .7mm 0 0 !important;
    font-size: 4.8pt !important;
    line-height: 1.12 !important;
  }

  .activity-logo {
    width: 6mm !important;
    height: 6mm !important;
    right: .8mm !important;
    top: .8mm !important;
    border-radius: 1mm !important;
  }

  .empty-slot {
    padding: 1.5mm !important;
    font-size: 5.1pt !important;
    min-height: 0 !important;
  }

  .period-matin {
    min-height: 0 !important;
  }

  .meal-gap {
    height: 5.2mm !important;
    min-height: 5.2mm !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .meal-banner {
    left: 0 !important;
    right: 0 !important;
    height: 5.2mm !important;
    min-height: 5.2mm !important;
    padding: 0 !important;
    border-radius: 1.2mm !important;
    font-size: 6pt !important;
    line-height: 1 !important;
    box-shadow: none !important;
  }

  .sheet-foot {
    flex: 0 0 auto !important;
    margin-top: 1.3mm !important;
    padding-top: .8mm !important;
    font-size: 4.8pt !important;
    line-height: 1.05 !important;
  }

  body.print-density-1 .sheet-head {
    margin-bottom: 2mm !important;
    padding-bottom: 1.2mm !important;
  }

  body.print-density-1 .portrait {
    width: 14mm !important;
    height: 14mm !important;
  }

  body.print-density-1 .sheet h2 {
    font-size: 14.2pt !important;
  }

  body.print-density-1 .week-grid {
    column-gap: 1.35mm !important;
  }

  body.print-density-1 .day-head {
    padding: 1.2mm 1mm !important;
  }

  body.print-density-1 .activity-card {
    padding: 1mm !important;
    margin-bottom: .8mm !important;
  }

  body.print-density-1 .activity-title {
    font-size: 6.8pt !important;
  }

  body.print-density-1 .activity-time {
    font-size: 5.5pt !important;
  }

  body.print-density-1 .activity-meta {
    font-size: 4.95pt !important;
  }

  body.print-density-1 .activity-desc {
    font-size: 4.55pt !important;
  }

  body.print-density-1 .activity-logo {
    width: 5.5mm !important;
    height: 5.5mm !important;
  }

  body.print-density-1 .meal-gap,
  body.print-density-1 .meal-banner {
    height: 4.9mm !important;
    min-height: 4.9mm !important;
  }

  body.print-density-2 .sheet-head {
    margin-bottom: 1.7mm !important;
    padding-bottom: 1mm !important;
  }

  body.print-density-2 .portrait {
    width: 13mm !important;
    height: 13mm !important;
  }

  body.print-density-2 .sheet h2 {
    font-size: 13.5pt !important;
  }

  body.print-density-2 .eyebrow,
  body.print-density-2 .muted,
  body.print-density-2 #printDate,
  body.print-density-2 .legend {
    font-size: 5.5pt !important;
  }

  body.print-density-2 .week-grid {
    column-gap: 1.15mm !important;
  }

  body.print-density-2 .day-head {
    padding: 1.05mm .9mm !important;
  }

  body.print-density-2 .day-head h3 {
    font-size: 7.9pt !important;
  }

  body.print-density-2 .day-head span {
    font-size: 4.8pt !important;
  }

  body.print-density-2 .period {
    padding: .95mm !important;
  }

  body.print-density-2 .period-title {
    margin-bottom: .65mm !important;
    font-size: 5.55pt !important;
  }

  body.print-density-2 .activity-card {
    padding: .85mm !important;
    margin-bottom: .68mm !important;
  }

  body.print-density-2 .activity-title {
    font-size: 6.35pt !important;
    padding-right: 6mm !important;
  }

  body.print-density-2 .activity-time {
    font-size: 5.1pt !important;
    padding: .25mm .6mm !important;
  }

  body.print-density-2 .activity-meta {
    margin-top: .55mm !important;
    font-size: 4.7pt !important;
    line-height: 1.1 !important;
  }

  body.print-density-2 .activity-desc {
    margin-top: .55mm !important;
    font-size: 4.3pt !important;
    line-height: 1.08 !important;
  }

  body.print-density-2 .activity-logo {
    width: 5mm !important;
    height: 5mm !important;
  }

  body.print-density-2 .empty-slot {
    padding: 1.1mm !important;
    font-size: 4.7pt !important;
  }

  body.print-density-2 .meal-gap,
  body.print-density-2 .meal-banner {
    height: 4.6mm !important;
    min-height: 4.6mm !important;
  }

  body.print-density-2 .sheet-foot {
    margin-top: 1mm !important;
    font-size: 4.45pt !important;
  }

  body.print-density-3 .sheet-head {
    margin-bottom: 1.5mm !important;
    padding-bottom: .9mm !important;
  }

  body.print-density-3 .portrait {
    width: 12mm !important;
    height: 12mm !important;
  }

  body.print-density-3 .sheet h2 {
    font-size: 13pt !important;
  }

  body.print-density-3 .eyebrow,
  body.print-density-3 .muted,
  body.print-density-3 #printDate,
  body.print-density-3 .legend {
    font-size: 5.2pt !important;
  }

  body.print-density-3 .week-grid {
    column-gap: 1mm !important;
  }

  body.print-density-3 .day-head {
    padding: .95mm .8mm !important;
  }

  body.print-density-3 .day-head h3 {
    font-size: 7.4pt !important;
  }

  body.print-density-3 .day-head span {
    font-size: 4.6pt !important;
  }

  body.print-density-3 .period {
    padding: .8mm !important;
  }

  body.print-density-3 .period-title {
    margin-bottom: .55mm !important;
    font-size: 5.2pt !important;
  }

  body.print-density-3 .activity-card {
    padding: .72mm !important;
    margin-bottom: .55mm !important;
  }

  body.print-density-3 .activity-title {
    font-size: 6.05pt !important;
    padding-right: 5.5mm !important;
  }

  body.print-density-3 .activity-time {
    font-size: 4.9pt !important;
  }

  body.print-density-3 .activity-meta {
    font-size: 4.5pt !important;
  }

  body.print-density-3 .activity-desc {
    font-size: 4.1pt !important;
  }

  body.print-density-3 .activity-logo {
    width: 4.6mm !important;
    height: 4.6mm !important;
  }

  body.print-density-3 .meal-gap,
  body.print-density-3 .meal-banner {
    height: 4.25mm !important;
    min-height: 4.25mm !important;
  }

  body.print-density-3 .sheet-foot {
    margin-top: .8mm !important;
    font-size: 4.2pt !important;
  }
}
`;

  document.head.appendChild(style);
}

/* =========================================================
   PIÈCES JOINTES GRIST
   ========================================================= */

let attachmentTokenInfo = null;

async function attachmentUrl(value) {
  const ids = refIds(value);
  if (!ids.length) return '';

  const id = ids[0];
  if (state.attachmentUrls.has(id)) return state.attachmentUrls.get(id);

  try {
    if (!attachmentTokenInfo) {
      attachmentTokenInfo = await grist.docApi.getAccessToken({ readOnly: true });
    }

    const url = `${attachmentTokenInfo.baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(attachmentTokenInfo.token)}`;
    state.attachmentUrls.set(id, url);
    return url;
  } catch (error) {
    console.warn(`Pièce jointe ${id} non chargée`, error);
    return '';
  }
}

/* =========================================================
   CHARGEMENT DES TABLES
   ========================================================= */

async function fetchTableSafe(key, required) {
  const name = TABLES[key];
  try {
    return rowsFromTable(await grist.docApi.fetchTable(name));
  } catch (error) {
    if (required) {
      throw new Error(`Impossible de lire la table obligatoire « ${name} » : ${error?.message || error}`);
    }
    console.warn(`Table optionnelle « ${name} » non disponible`, error);
    return [];
  }
}

async function fetchAll({ preserveSelection = false } = {}) {
  showStatus('Lecture des tables Grist…');

  const result = {};

  for (const key of REQUIRED_TABLES) {
    result[key] = await fetchTableSafe(key, true);
  }

  for (const key of OPTIONAL_TABLES) {
    result[key] = await fetchTableSafe(key, false);
  }

  state.tables = result;
  buildModel();
  populatePeople();

  if (!state.people.length) {
    state.selectedId = null;
    showStatus('Aucun usager actif trouvé dans la table Usagers.', true);
    return;
  }

  const previousExists = preserveSelection &&
    state.people.some((person) => person.id === Number(state.selectedId));

  if (!previousExists) {
    state.selectedId = state.people[0].id;
  }

  requireElement('personSelect').value = String(state.selectedId);
  await render();
}

/* =========================================================
   CONSTRUCTION DU MODÈLE
   ========================================================= */

function buildModel() {
  const users = state.tables.usagers || [];
  const activities = state.tables.activites || [];
  const participations = state.tables.participations || [];

  const days = byId(state.tables.jours || []);
  const hours = byId(state.tables.heures || []);
  const animators = byId(state.tables.animateurs || []);
  const otherActivityTypes = byId(state.tables.activitesAutres || []);
  const partners = byId(state.tables.reeducateurs || []);

  const participantsByActivity = new Map();

  for (const participation of participations) {
    const activityId = refIds(participation.Activites)[0];
    if (!activityId) continue;

    const participantSet = participantsByActivity.get(activityId) || new Set();
    for (const participantId of refIds(participation.Participants)) {
      participantSet.add(participantId);
    }
    participantsByActivity.set(activityId, participantSet);
  }

  state.people = users
    .filter((user) => !isTrue(user.Parti_e))
    .map((user) => ({
      id: Number(user.id),
      name: text(
        user.Usager,
        `${text(user.Prenom)} ${text(user.Nom)}`.trim()
      ),
      lastName: text(user.Nom).trim(),
      firstName: text(user.Prenom).trim(),
      portrait: user.Portrait,
      flags: {
        Lundi: isTrue(user.Lu),
        Mardi: isTrue(user.Ma),
        Mercredi: isTrue(user.Me),
        Jeudi: isTrue(user.Je),
        Vendredi: isTrue(user.Ve)
      }
    }))
    .sort((a, b) =>
      a.lastName.localeCompare(b.lastName, 'fr', { sensitivity: 'base' }) ||
      a.firstName.localeCompare(b.firstName, 'fr', { sensitivity: 'base' })
    );

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
        ))
        .filter(Boolean);

      return {
        id: Number(activity.id),
        kind: 'regular',
        name: text(activity.Nom_activite, 'Activité'),
        day: normalizeDay(dayRow?.Jour || activity.gristHelper_Display2),
        dayOrder: Number(
          activity.Numero_du_jour_de_la_semaine ||
          activity.Jour_Num_jour ||
          dayRow?.Num_jour ||
          99
        ),
        start: text(startRow?.Heures || activity.gristHelper_Display3),
        end: text(endRow?.Heures || activity.gristHelper_Display4),
        animators: animatorNames,
        capacity: activity.Capacite,
        description: text(activity.Remarques_planning || activity.Description).slice(0, 100),
        visual: activity.Visuel,
        groupOpen: isTrue(activity.Groupe_ouvert),
        fullYear: isTrue(activity.Annee_complete),
        participants: participantsByActivity.get(Number(activity.id)) || new Set()
      };
    })
    .sort(sortActivities);

  state.otherActivities = (state.tables.reeducations || [])
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

      const hourRow = hours.get(refIds(otherActivity.Horaire)[0]);
      const rawSchedule = text(hourRow?.Heures || otherActivity.gristHelper_Display3);
      const scheduleParts = rawSchedule
        .split(/\s*[–—-]\s*/)
        .filter(Boolean);

      return {
        id: Number(otherActivity.id),
        kind: 'other',
        name: typeName,
        day: normalizeDay(dayRow?.Jour || otherActivity.gristHelper_Display2),
        dayOrder: Number(
          otherActivity.Num_du_jour ||
          otherActivity.Jour_Num_jour ||
          dayRow?.Num_jour ||
          99
        ),
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
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  );
}

/* =========================================================
   INTERFACE
   ========================================================= */

function populatePeople() {
  const select = requireElement('personSelect');
  select.innerHTML = state.people
    .map((person) => `<option value="${person.id}">${esc(person.name)}</option>`)
    .join('');
}

function showStatus(message, error = false) {
  const status = requireElement('status');
  const sheet = requireElement('sheet');

  status.textContent = message;
  status.classList.toggle('error', error);
  status.classList.remove('hidden');
  sheet.classList.add('hidden');
}

function periodOf(activity) {
  return minutes(activity.start) < 13 * 60 ? 'Matin' : 'Après-midi';
}

function isPresent(person, day) {
  return Boolean(person?.flags?.[day]);
}

function updatePrintDate() {
  const printDate = $('printDate');
  if (!printDate) return;

  printDate.textContent = `Imprimé le ${new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long'
  }).format(new Date())}`;
}

function opacityFor(day) {
  const input = $(`opacity${day}`);
  if (!input) return 0.18;

  const value = Number(input.value);
  if (!Number.isFinite(value)) return 0.18;

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

/* =========================================================
   IMPRESSION — AJUSTEMENT INTELLIGENT
   ========================================================= */

const PRINT_DENSITY_CLASSES = [
  'print-density-1',
  'print-density-2',
  'print-density-3'
];

function clearPrintDensity() {
  document.body.classList.remove(...PRINT_DENSITY_CLASSES);
}

function mmToPx(mm) {
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.left = '-9999px';
  probe.style.top = '0';
  probe.style.width = '1mm';
  probe.style.height = `${mm}mm`;
  probe.style.pointerEvents = 'none';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const pixels = probe.getBoundingClientRect().height;
  probe.remove();
  return pixels;
}

function queueMealAlignment() {
  requestAnimationFrame(() => {
    alignMealBanner();
    setTimeout(alignMealBanner, 60);
    setTimeout(alignMealBanner, 180);
  });
}

function attachImageReflowHandlers() {
  const grid = $('weekGrid');
  if (!grid) return;

  grid.querySelectorAll('img').forEach((img) => {
    if (img.dataset.boundReflow === '1') return;
    img.dataset.boundReflow = '1';

    img.addEventListener('load', () => {
      alignMealBanner();
    });

    img.addEventListener('error', () => {
      alignMealBanner();
    });
  });
}

function resetMealAlignment() {
  const grid = $('weekGrid');
  if (!grid) return;

  grid.querySelectorAll('.period-matin').forEach((section) => {
    section.style.removeProperty('min-height');
  });

  const banner = grid.querySelector('.meal-banner');
  if (banner) {
    banner.style.removeProperty('top');
  }
}

function alignMealBanner() {
  const grid = $('weekGrid');
  if (!grid) return;

  const morningSections = [...grid.querySelectorAll('.period-matin')];
  const banner = grid.querySelector('.meal-banner');

  if (!morningSections.length || !banner) return;

  morningSections.forEach((section) => {
    section.style.removeProperty('min-height');
  });
  banner.style.removeProperty('top');

  const maxMorningHeight = Math.ceil(
    Math.max(
      ...morningSections.map((section) => section.getBoundingClientRect().height)
    )
  );

  morningSections.forEach((section) => {
    section.style.minHeight = `${maxMorningHeight}px`;
  });

  const firstGap = grid.querySelector('.meal-gap');
  if (!firstGap) return;

  const gridRect = grid.getBoundingClientRect();
  const gapRect = firstGap.getBoundingClientRect();
  banner.style.top = `${Math.ceil(gapRect.top - gridRect.top)}px`;
}

function sheetFitsA4() {
  const sheet = $('sheet');
  if (!sheet) return true;

  const maxHeight = mmToPx(200); // A4 paysage avec 5 mm + 5 mm de marges.
  const maxWidth = mmToPx(287);  // A4 paysage avec 5 mm + 5 mm de marges.

  const rect = sheet.getBoundingClientRect();
  const heightFits = rect.height <= maxHeight + 3;
  const widthFits = rect.width <= maxWidth + 2;

  return heightFits && widthFits;
}

function preparePrintLayout() {
  ensureInjectedStyles();
  updatePrintDate();
  clearPrintDensity();
  resetMealAlignment();
  alignMealBanner();

  const attempts = [
    null,
    'print-density-1',
    'print-density-2',
    'print-density-3'
  ];

  for (const densityClass of attempts) {
    clearPrintDensity();
    if (densityClass) {
      document.body.classList.add(densityClass);
    }

    resetMealAlignment();
    alignMealBanner();

    const sheet = $('sheet');
    if (sheet) {
      // Force le recalcul de mise en page avant la mesure.
      void sheet.offsetHeight;
    }

    if (sheetFitsA4()) {
      return;
    }
  }
}

function cleanupPrintLayout() {
  clearPrintDensity();
  resetMealAlignment();
  queueMealAlignment();
}

function requestPrint() {
  preparePrintLayout();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}

/* =========================================================
   AFFICHAGE
   ========================================================= */

async function render() {
  const person = state.people.find(
    (item) => item.id === Number(state.selectedId)
  );

  if (!person) {
    showStatus('Aucun usager sélectionné.', true);
    return;
  }

  requireElement('status').classList.add('hidden');
  requireElement('sheet').classList.remove('hidden');
  requireElement('personName').textContent = person.name;

  const presentDays = DAYS.filter((day) => isPresent(person, day));
  requireElement('presenceText').textContent = presentDays.length
    ? presentDays.join(', ')
    : 'Présence habituelle non renseignée';

  const portraitUrl = await attachmentUrl(person.portrait);
  requireElement('portrait').innerHTML = portraitUrl
    ? `<img src="${portraitUrl}" alt="Portrait de ${esc(person.name)}">`
    : `<span>${esc(initials(person.name))}</span>`;

  const cards = await Promise.all(
    DAYS.map((day) => renderDay(person, day))
  );

  requireElement('weekGrid').innerHTML = `
    ${cards.join('')}
    <div class="meal-banner" aria-label="Repas de 12 heures">
      <span>12 h · Repas</span>
    </div>
  `;

  updatePrintDate();
  attachImageReflowHandlers();
  queueMealAlignment();
}

async function renderDay(person, day) {
  const present = isPresent(person, day);

  const enrolledActivities = present
    ? state.activities.filter(
        (activity) =>
          activity.day === day &&
          activity.participants.has(person.id)
      )
    : [];

  function shouldShowOpenGroup(openActivity) {
    if (!present) return false;

    const openPeriod = periodOf(openActivity);
    const enrolledSamePeriod = enrolledActivities.filter(
      (activity) => periodOf(activity) === openPeriod
    );

    if (!enrolledSamePeriod.length) return true;

    const hasFullYearActivity = enrolledSamePeriod.some(
      (activity) => activity.fullYear === true
    );

    return !hasFullYearActivity;
  }

  const regularActivities = state.activities.filter((activity) => {
    if (!present) return false;
    if (activity.day !== day) return false;

    if (activity.participants.has(person.id)) return true;
    if (!activity.groupOpen) return false;

    return shouldShowOpenGroup(activity);
  });

  const otherActivities = state.otherActivities.filter(
    (activity) =>
      present &&
      activity.day === day &&
      activity.participants.has(person.id)
  );

  const activities = [...regularActivities, ...otherActivities]
    .sort(sortActivities);

  const groups = {
    Matin: activities.filter((activity) => periodOf(activity) === 'Matin'),
    'Après-midi': activities.filter((activity) => periodOf(activity) === 'Après-midi')
  };

  const sections = [];
  const showEmpty = $('showEmpty') ? $('showEmpty').checked : true;

  for (const label of ['Matin', 'Après-midi']) {
    const list = groups[label];

    if (!list.length && !showEmpty) {
      if (label === 'Matin') {
        sections.push('<div class="meal-gap" aria-hidden="true"></div>');
      }
      continue;
    }

    const inner = list.length
      ? (await Promise.all(list.map(activityCard))).join('')
      : `<div class="empty-slot">${present ? 'Aucune activité renseignée' : 'Absent'}</div>`;

    const cssLabel = label === 'Matin' ? 'matin' : 'après-midi';

    sections.push(`
      <section class="period period-${cssLabel}">
        <div class="period-title">${label}</div>
        ${inner}
      </section>
    `);

    if (label === 'Matin') {
      sections.push('<div class="meal-gap" aria-hidden="true"></div>');
    }
  }

  const dayColor = DAY_COLORS[day];
  const dayBackground = hexToRgba(dayColor, opacityFor(day));
  const absenceClass = present ? '' : ' day-absent';

  return `
    <article class="day${absenceClass}" style="--day-color:${dayColor};--day-background:${dayBackground};">
      <div class="day-head">
        <h3>${day}</h3>
        <span>${present
          ? `${activities.length} activité${activities.length > 1 ? 's' : ''}`
          : 'ABSENT·E'}</span>
      </div>
      <div class="day-content">${sections.join('')}</div>
    </article>
  `;
}

async function activityCard(activity) {
  const logo = await attachmentUrl(activity.visual);

  const time = activity.schedule ||
    [activity.start, activity.end].filter(Boolean).join(' – ');

  const cardColor = colorFor(activity.name);

  const regularMeta = activity.kind === 'regular' && activity.animators.length
    ? `<div><strong>Avec :</strong> ${esc(activity.animators.join(', '))}</div>`
    : '';

  const otherMeta = activity.kind === 'other'
    ? `
      ${activity.partner ? `<div><strong>Avec :</strong> ${esc(activity.partner)}</div>` : ''}
      ${activity.place ? `<div><strong>Lieu :</strong> ${esc(activity.place)}</div>` : ''}
    `
    : '';

  return `
    <article class="activity-card${activity.kind === 'other' ? ' activity-card-other' : ''}" style="--card-color:${cardColor}">
      ${logo ? `<img class="activity-logo" src="${logo}" alt="">` : ''}
      <h4 class="activity-title">${esc(activity.name)}</h4>
      ${time ? `<div class="activity-time">${esc(time)}</div>` : ''}
      <div class="activity-meta">${regularMeta}${otherMeta}</div>
      ${activity.description ? `<p class="activity-desc">${esc(activity.description)}</p>` : ''}
    </article>
  `;
}

/* =========================================================
   ERREURS
   ========================================================= */

function showError(error) {
  console.error(error);

  try {
    showStatus('Une erreur empêche l’affichage du planning.', true);
  } catch (_) {
    // Si le HTML lui-même est incomplet, l'erreur reste visible en console.
  }

  const errorText = $('errorText');
  if (errorText) {
    errorText.textContent = `${error?.message || error}\n\nTables attendues :\n${Object.values(TABLES).join('\n')}`;
  }

  const dialog = $('errorDialog');
  if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
    dialog.showModal();
  }
}

/* =========================================================
   VÉRIFICATION DU HTML
   ========================================================= */

function validateHtml() {
  const requiredIds = [
    'personSelect',
    'formatSelect',
    'printBtn',
    'reloadBtn',
    'status',
    'sheet',
    'personName',
    'presenceText',
    'portrait',
    'weekGrid'
  ];

  const missing = requiredIds.filter((id) => !$(id));
  if (missing.length) {
    throw new Error(`index.html incompatible : éléments manquants ${missing.map((id) => `#${id}`).join(', ')}`);
  }
}

/* =========================================================
   ÉVÉNEMENTS
   ========================================================= */

function bindEvents() {
  onIfPresent('personSelect', 'change', (event) => {
    state.selectedId = Number(event.target.value);
    render().catch(showError);
  });

  onIfPresent('formatSelect', 'change', (event) => {
    document.body.classList.toggle('print-a3', event.target.value === 'a3');
  });

  onIfPresent('showEmpty', 'change', () => {
    render().catch(showError);
  });

  for (const day of DAYS) {
    onIfPresent(`opacity${day}`, 'input', () => {
      render().catch(showError);
    });
  }

  onIfPresent('printBtn', 'click', () => {
    requestPrint();
  });

  onIfPresent('reloadBtn', 'click', () => {
    fetchAll({ preserveSelection: true }).catch(showError);
  });

  window.addEventListener('beforeprint', () => {
    preparePrintLayout();
  });

  window.addEventListener('afterprint', () => {
    cleanupPrintLayout();
  });

  window.addEventListener('resize', () => {
    if (!$('sheet')?.classList.contains('hidden')) {
      clearPrintDensity();
      queueMealAlignment();
    }
  });
}

/* =========================================================
   INITIALISATION GRIST
   ========================================================= */

async function start() {
  ensureInjectedStyles();
  validateHtml();
  bindEvents();

  grist.ready({ requiredAccess: 'full' });

  if (typeof grist.onOptions === 'function') {
    grist.onOptions((_options, interaction) => {
      if (
        interaction?.access_level &&
        interaction.access_level !== 'full'
      ) {
        showStatus(
          'Autorisez « Accès complet au document » pour lire les tables liées.',
          true
        );
      }
    });
  }

  await fetchAll();
}

start().catch(showError);
