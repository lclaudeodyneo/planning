'use strict';

/* =========================================================
   PLANNING INDIVIDUEL SAJ ANAGALLIS
   Version raccordée au schéma Grist contrôlé le 08/09/2026
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

function firstDefined(row, columnNames, fallback = '') {
  for (const columnName of columnNames) {
    if (row && row[columnName] != null && row[columnName] !== '') {
      return row[columnName];
    }
  }
  return fallback;
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

  // Schéma Grist contrôlé : Parti_e, Lu, Ma, Me, Je, Ve.
  // La colonne Presence n'existe pas dans le fichier transmis : elle n'est pas utilisée.
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
        // Colonne réelle du .grist : Numero_du_jour_de_la_semaine
        dayOrder: Number(
          activity.Numero_du_jour_de_la_semaine ||
          dayRow?.Num_jour ||
          99
        ),
        start: text(startRow?.Heures || activity.gristHelper_Display3),
        end: text(endRow?.Heures || activity.gristHelper_Display4),
        animators: animatorNames,
        capacity: activity.Capacite,
        description: text(activity.Remarques_planning).slice(0, 100),
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

  alignMealBanner();
  updatePrintDate();
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

  // Toujours supprimer les anciennes dimensions avant de remesurer.
  // C'est indispensable lors du passage écran -> impression :
  // les hauteurs calculées à l'écran ne doivent jamais être réutilisées en A4.
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

/* =========================================================
   AJUSTEMENT IMPRESSION SUR UNE SEULE PAGE
   ---------------------------------------------------------
   L'ancienne correction ne suffisait pas : après remise à zéro,
   alignMealBanner() imposait de nouveau à tous les matins la hauteur
   du matin le plus haut. C'est nécessaire pour garder un bandeau repas
   horizontal, mais cela peut augmenter la hauteur totale imprimée.

   La stratégie ci-dessous :
   1. neutralise le min-height:100% de .day-content uniquement à l'impression ;
   2. réduit le meal-gap à la hauteur exacte du bandeau (24 px) ;
   3. recalcule proprement l'alignement repas ;
   4. si le planning dépasse encore la hauteur imprimable, applique
      automatiquement le plus petit zoom nécessaire pour tenir sur 1 page.
   ========================================================= */

function clearPrintFit() {
  const sheet = $('sheet');
  const grid = $('weekGrid');

  if (sheet) {
    sheet.style.removeProperty('zoom');
    sheet.style.removeProperty('width');
  }

  if (!grid) return;

  grid.style.removeProperty('align-items');

  grid.querySelectorAll('.day-content').forEach((content) => {
    content.style.removeProperty('min-height');
  });

  grid.querySelectorAll('.meal-gap').forEach((gap) => {
    gap.style.removeProperty('height');
  });
}

function printableHeightPx() {
  const a3 =
    $('formatSelect')?.value === 'a3' ||
    document.body.classList.contains('print-a3');

  // A4 paysage : hauteur 210 mm, marges CSS 8 + 8 mm.
  // A3 paysage : hauteur 297 mm, marges CSS 9 + 9 mm.
  // On garde 3 mm de sécurité pour éviter qu'un arrondi de Firefox
  // ne déclenche une seconde page.
  const pageHeightMm = a3 ? 297 : 210;
  const verticalMarginsMm = a3 ? 18 : 16;
  const safetyMm = 3;

  return (pageHeightMm - verticalMarginsMm - safetyMm) * (96 / 25.4);
}

function preparePrintFit() {
  const sheet = $('sheet');
  const grid = $('weekGrid');

  if (!sheet || !grid) return;

  clearPrintFit();
  resetMealAlignment();

  // Évite que .day-content { min-height: 100% } ne crée une hauteur
  // artificielle dans la grille imprimée.
  grid.style.alignItems = 'start';

  grid.querySelectorAll('.day-content').forEach((content) => {
    content.style.minHeight = '0';
  });

  // Le bandeau d'impression fait 24 px : 30 px de meal-gap réservaient
  // encore 6 px inutiles dans chaque colonne.
  grid.querySelectorAll('.meal-gap').forEach((gap) => {
    gap.style.setProperty('height', '24px', 'important');
  });

  alignMealBanner();

  const maxHeight = printableHeightPx();

  // Force le calcul de mise en page avec les styles d'impression actifs.
  let currentHeight = sheet.getBoundingClientRect().height;

  if (!Number.isFinite(currentHeight) || currentHeight <= maxHeight) {
    return;
  }

  // Premier ajustement : uniquement la réduction strictement nécessaire.
  let zoom = Math.min(1, (maxHeight / currentHeight) * 0.985);
  zoom = Math.max(0.70, zoom);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    sheet.style.zoom = String(zoom);

    // Compenser la réduction de largeur du zoom pour continuer à exploiter
    // toute la largeur de la feuille et éviter des retours à la ligne inutiles.
    sheet.style.width = `${100 / zoom}%`;

    resetMealAlignment();
    alignMealBanner();

    currentHeight = sheet.getBoundingClientRect().height;

    if (!Number.isFinite(currentHeight) || currentHeight <= maxHeight) {
      break;
    }

    const correction = (maxHeight / currentHeight) * 0.985;
    const nextZoom = Math.max(0.70, zoom * correction);

    if (Math.abs(nextZoom - zoom) < 0.002) {
      zoom = Math.max(0.70, zoom - 0.01);
    } else {
      zoom = nextZoom;
    }
  }
}

function restoreScreenLayoutAfterPrint() {
  clearPrintFit();
  resetMealAlignment();

  requestAnimationFrame(() => {
    if (!$('sheet')?.classList.contains('hidden')) {
      alignMealBanner();
    }
  });
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
    updatePrintDate();
    window.print();
  });

  onIfPresent('reloadBtn', 'click', () => {
    fetchAll({ preserveSelection: true }).catch(showError);
  });

  window.addEventListener('beforeprint', () => {
    updatePrintDate();
    preparePrintFit();
  });

  window.addEventListener('afterprint', () => {
    restoreScreenLayoutAfterPrint();
  });

  window.addEventListener('resize', () => {
    if (!$('sheet')?.classList.contains('hidden')) {
      resetMealAlignment();
      alignMealBanner();
    }
  });
}

/* =========================================================
   INITIALISATION GRIST
   ========================================================= */

async function start() {
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
