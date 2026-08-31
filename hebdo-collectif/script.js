'use strict';


/* ============================================================
   PLANNING COLLECTIF
   SAJ ANAGALLIS
   ============================================================ */


/* ============================================================
   JOURS
   ============================================================ */

const DAYS = [

  {
    name: 'Lundi',
    key: 'monday',
    color: '#1598e2'
  },

  {
    name: 'Mardi',
    key: 'tuesday',
    color: '#2bb447'
  },

  {
    name: 'Mercredi',
    key: 'wednesday',
    color: '#c15bdf'
  },

  {
    name: 'Jeudi',
    key: 'thursday',
    color: '#eda820'
  },

  {
    name: 'Vendredi',
    key: 'friday',
    color: '#d65357'
  }

];


/* ============================================================
   TABLES GRIST
   ============================================================ */

const TABLES = {

  participations:
    'Participations',

  activities:
    'Activites',

  users:
    'Usagers',

  days:
    'Jours_de_la_semaine',

  hours:
    'Heures',

  animateurs:
    'Animateurs'

};


/* ============================================================
   ÉTAT
   ============================================================ */

let state = {

  participations: [],

  activities: [],

  users: [],

  days: [],

  hours: [],

  animateurs: []

};


let attachmentTokenInfo = null;

const attachmentCache =
  new Map();


/* ============================================================
   OUTILS
   ============================================================ */

function normalize(value) {

  return String(
    value ?? ''
  ).trim();

}


function get(
  row,
  ...names
) {

  for (
    const name
    of names
  ) {

    if (
      row &&
      row[name] !== undefined &&
      row[name] !== null &&
      row[name] !== ''
    ) {

      return row[name];

    }

  }

  return '';

}


/* ============================================================
   TABLE GRIST → LIGNES
   ============================================================ */

function rowsFromTable(table) {

  if (
    !table ||
    !Array.isArray(table.id)
  ) {

    return [];

  }


  return table.id.map(
    (
      id,
      index
    ) => {

      const row = {
        id
      };


      for (
        const [
          column,
          values
        ]
        of Object.entries(table)
      ) {

        row[column] =
          Array.isArray(values)
            ? values[index]
            : values;

      }


      return row;

    }
  );

}


/* ============================================================
   RÉFÉRENCES GRIST
   ============================================================ */

function listIds(value) {

  if (
    Array.isArray(value)
  ) {

    const list =
      (
        value[0] === 'L' ||
        value[0] === 'l'
      )
        ? value.slice(1)
        : value;


    return list
      .flat()
      .map(Number)
      .filter(Number.isFinite);

  }


  const number =
    Number(value);


  if (
    Number.isFinite(number) &&
    number !== 0
  ) {

    return [number];

  }


  return [];

}


function firstId(value) {

  return (
    listIds(value)[0]
    ??
    null
  );

}


function byId(rows) {

  return new Map(

    rows.map(
      row => [
        Number(row.id),
        row
      ]
    )

  );

}


/* ============================================================
   HEURES
   ============================================================ */

function minutes(value) {

  const text =
    normalize(value);


  const match =
    text.match(
      /(\d{1,2})\s*[:h]\s*(\d{2})/i
    );


  if (!match) {

    return 9999;

  }


  return (
    Number(match[1]) * 60
    +
    Number(match[2])
  );

}


function referenceText(
  value,
  rows,
  names
) {

  const id =
    firstId(value);


  if (!id) {

    return normalize(value);

  }


  const row =
    byId(rows).get(id);


  if (!row) {

    return '';

  }


  return normalize(
    get(
      row,
      ...names
    )
  );

}


/* ============================================================
   JOUR DE L'ACTIVITÉ
   ============================================================ */

function activityDay(activity) {

  const helper =
    normalize(
      get(
        activity,
        'gristHelper_Display2'
      )
    );


  if (helper) {

    return helper;

  }


  return referenceText(

    get(
      activity,
      'Jour'
    ),

    state.days,

    [
      'Jour'
    ]

  );

}


/* ============================================================
   HEURE DE L'ACTIVITÉ
   ============================================================ */

function activityHour(
  activity,
  start = true
) {

  const helper =
    start
      ? 'gristHelper_Display3'
      : 'gristHelper_Display4';


  const column =
    start
      ? 'Heure_debut'
      : 'Heure_fin';


  const displayed =
    normalize(
      get(
        activity,
        helper
      )
    );


  if (displayed) {

    return displayed;

  }


  return referenceText(

    get(
      activity,
      column
    ),

    state.hours,

    [
      'Heures'
    ]

  );

}


/* ============================================================
   NOM USAGER
   ============================================================ */

function userName(user) {

  if (!user) {

    return '';

  }


  const display =
    normalize(
      get(
        user,
        'Usager'
      )
    );


  if (display) {

    return display;

  }


  const prenom =
    normalize(
      get(
        user,
        'Prenom',
        'Prénom'
      )
    );


  const nom =
    normalize(
      get(
        user,
        'Nom'
      )
    );


  return (
    `${prenom} ${nom}`
  ).trim();

}


function firstName(user) {

  return (

    normalize(
      get(
        user,
        'Prenom',
        'Prénom'
      )
    )

    ||

    userName(user)

  );

}


/* ============================================================
   INITIALES
   ============================================================ */

function initials(name) {

  return normalize(name)

    .split(/\s+/)

    .filter(Boolean)

    .slice(0, 2)

    .map(
      word =>
        word
          .charAt(0)
          .toUpperCase()
    )

    .join('');

}


/* ============================================================
   IMAGES GRIST
   ============================================================ */

async function attachmentUrl(value) {

  const id =
    listIds(value)[0];


  if (!id) {

    return '';

  }


  if (
    attachmentCache.has(id)
  ) {

    return attachmentCache.get(id);

  }


  try {

    if (
      !attachmentTokenInfo
    ) {

      attachmentTokenInfo =
        await grist.docApi
          .getAccessToken({

            readOnly: true

          });

    }


    const url =

      `${attachmentTokenInfo.baseUrl}`

      +

      `/attachments/${id}/download`

      +

      `?auth=${encodeURIComponent(
        attachmentTokenInfo.token
      )}`;


    attachmentCache.set(
      id,
      url
    );


    return url;

  }

  catch (error) {

    console.error(
      'Impossible de charger la pièce jointe',
      id,
      error
    );


    return '';

  }

}


/* ============================================================
   PARTICIPANTS D'UNE ACTIVITÉ
   ============================================================ */

function participantsForActivity(
  activityId
) {

  const ids =
    new Set();


  state.participations
    .forEach(
      participation => {

        const linkedActivity =
          firstId(
            get(
              participation,
              'Activites'
            )
          );


        if (
          Number(linkedActivity)
          !==
          Number(activityId)
        ) {

          return;

        }


        listIds(
          get(
            participation,
            'Participants'
          )
        )
        .forEach(
          id =>
            ids.add(
              Number(id)
            )
        );

      }
    );


  const users =
    byId(
      state.users
    );


  return [...ids]

    .map(
      id =>
        users.get(id)
    )

    .filter(Boolean)

    .sort(
      (
        a,
        b
      ) =>
        firstName(a)
          .localeCompare(
            firstName(b),
            'fr'
          )
    );

}


/* ============================================================
   ANIMATEURS
   ============================================================ */

function animateursForActivity(
  activity
) {

  const value =
    get(
      activity,
      'Animateur_s',
      'Animateurs',
      'Animateur'
    );


  const ids =
    listIds(value);


  if (!ids.length) {

    return normalize(value);

  }


  const map =
    byId(
      state.animateurs
    );


  const names =
    ids
      .map(
        id =>
          map.get(
            Number(id)
          )
      )

      .filter(Boolean)

      .map(
        person => {

          const display =
            normalize(
              get(
                person,
                'Nom2'
              )
            );


          if (display) {

            return display;

          }


          const prenom =
            normalize(
              get(
                person,
                'Prenom',
                'Prénom'
              )
            );


          const nom =
            normalize(
              get(
                person,
                'Nom'
              )
            );


          return (
            `${prenom} ${nom}`
          ).trim();

        }
      )

      .filter(Boolean);


  return names.join(', ');

}


/* ============================================================
   CRÉATION D'UN PARTICIPANT
   ============================================================ */

async function createParticipant(
  user
) {

  const person =
    document.createElement(
      'div'
    );


  person.className =
    'participant';


  const portrait =
    document.createElement(
      'div'
    );


  portrait.className =
    'participant-photo';


  const url =
    await attachmentUrl(
      get(
        user,
        'Portrait'
      )
    );


  if (url) {

    const image =
      document.createElement(
        'img'
      );


    image.src =
      url;


    image.alt =
      userName(user);


    image.onerror =
      () => {

        portrait.innerHTML =
          '';

        portrait.textContent =
          initials(
            userName(user)
          );

      };


    portrait.appendChild(
      image
    );

  }

  else {

    portrait.textContent =
      initials(
        userName(user)
      );

  }


  const name =
    document.createElement(
      'div'
    );


  name.className =
    'participant-name';


  name.textContent =
    firstName(user);


  person.appendChild(
    portrait
  );


  person.appendChild(
    name
  );


  return person;

}


/* ============================================================
   CARTE ACTIVITÉ
   ============================================================ */

async function createActivityCard(
  activity
) {

  const card =
    document.createElement(
      'article'
    );


  card.className =
    'activity-card';


  /* ========================================================
     HAUT
     ======================================================== */

  const top =
    document.createElement(
      'div'
    );


  top.className =
    'activity-top';


  /* ========================================================
     TEXTE
     ======================================================== */

  const info =
    document.createElement(
      'div'
    );


  info.className =
    'activity-info';


  const title =
    document.createElement(
      'div'
    );


  title.className =
    'activity-title';


  title.textContent =
    normalize(
      get(
        activity,
        'Nom_activite'
      )
    )
    ||
    'Activité';


  const time =
    document.createElement(
      'div'
    );


  time.className =
    'activity-time';


  const start =
    activityHour(
      activity,
      true
    );


  const end =
    activityHour(
      activity,
      false
    );


  if (
    start &&
    end
  ) {

    time.textContent =
      `${start} – ${end}`;

  }

  else {

    time.textContent =
      start || end || '';

  }


  info.appendChild(
    title
  );


  if (
    time.textContent
  ) {

    info.appendChild(
      time
    );

  }


  /* ========================================================
     PICTOGRAMME
     ======================================================== */

  const pictogram =
    document.createElement(
      'div'
    );


  pictogram.className =
    'activity-pictogram';


  const visualUrl =
    await attachmentUrl(
      get(
        activity,
        'Visuel'
      )
    );


  if (visualUrl) {

    const image =
      document.createElement(
        'img'
      );


    image.src =
      visualUrl;


    image.alt =
      title.textContent;


    pictogram.appendChild(
      image
    );

  }


  top.appendChild(
    info
  );


  top.appendChild(
    pictogram
  );


  card.appendChild(
    top
  );


  /* ========================================================
     ANIMATEURS
     ======================================================== */

  const staff =
    animateursForActivity(
      activity
    );


  if (staff) {

    const staffElement =
      document.createElement(
        'div'
      );


    staffElement.className =
      'activity-staff';


    const strong =
      document.createElement(
        'strong'
      );


    strong.textContent =
      'Avec : ';


    staffElement.appendChild(
      strong
    );


    staffElement.appendChild(
      document.createTextNode(
        staff
      )
    );


    card.appendChild(
      staffElement
    );

  }


  /* ========================================================
     PARTICIPANTS
     ======================================================== */

  const participants =
    participantsForActivity(
      activity.id
    );


  if (
    participants.length
  ) {

    const participantTitle =
      document.createElement(
        'div'
      );


    participantTitle.className =
      'participant-title';


    participantTitle.textContent =
      participants.length === 1
        ? 'Participant'
        : 'Participants';


    card.appendChild(
      participantTitle
    );


    const grid =
      document.createElement(
        'div'
      );


    grid.className =
      'participant-grid';


    for (
      const participant
      of participants
    ) {

      grid.appendChild(
        await createParticipant(
          participant
        )
      );

    }


    card.appendChild(
      grid
    );

  }


  return card;

}


/* ============================================================
   ACTIVITÉS D'UN JOUR
   ============================================================ */

function activitiesForDay(
  day
) {

  return state.activities

    .filter(
      activity =>

        normalize(
          activityDay(activity)
        ).toLowerCase()

        ===

        day.name.toLowerCase()

    )

    .sort(
      (
        a,
        b
      ) =>

        minutes(
          activityHour(
            a,
            true
          )
        )

        -

        minutes(
          activityHour(
            b,
            true
          )
        )
    );

}


/* ============================================================
   CELLULE MATIN / APRÈS-MIDI
   ============================================================ */

async function createPeriodCell(
  day,
  activities,
  label
) {

  const cell =
    document.createElement(
      'section'
    );


  cell.className =
    `period-cell bg-${day.key}`;


  const periodLabel =
    document.createElement(
      'div'
    );


  periodLabel.className =
    'period-label';


  periodLabel.textContent =
    label;


  cell.appendChild(
    periodLabel
  );


  const list =
    document.createElement(
      'div'
    );


  list.className =
    'activity-list';


  if (
    !activities.length
  ) {

    const empty =
      document.createElement(
        'div'
      );


    empty.className =
      'empty-period';


    empty.textContent =
      'Aucune activité renseignée';


    list.appendChild(
      empty
    );

  }

  else {

    for (
      const activity
      of activities
    ) {

      list.appendChild(
        await createActivityCard(
          activity
        )
      );

    }

  }


  cell.appendChild(
    list
  );


  return cell;

}


/* ============================================================
   RENDU
   ============================================================ */

async function render() {

  const planning =
    document.getElementById(
      'planning'
    );


  planning.innerHTML =
    '';


  /* ========================================================
     ACTIVITÉS PAR JOUR
     ======================================================== */

  const dayData =
    DAYS.map(
      day => {

        const activities =
          activitiesForDay(
            day
          );


        const morning =
          activities.filter(
            activity =>
              minutes(
                activityHour(
                  activity,
                  true
                )
              )
              <
              720
          );


        const afternoon =
          activities.filter(
            activity =>
              minutes(
                activityHour(
                  activity,
                  true
                )
              )
              >=
              720
          );


        return {

          day,
          activities,
          morning,
          afternoon

        };

      }
    );


  /* ========================================================
     BANDEAU VIOLET
     ======================================================== */

  const strip =
    document.createElement(
      'div'
    );


  strip.className =
    'week-strip';


  DAYS.forEach(
    day => {

      const item =
        document.createElement(
          'div'
        );


      item.className =
        'week-strip-day';


      item.textContent =
        day.name;


      strip.appendChild(
        item
      );

    }
  );


  planning.appendChild(
    strip
  );


  /* ========================================================
     GRILLE
     ======================================================== */

  const grid =
    document.createElement(
      'div'
    );


  grid.className =
    'planning-grid';


  /* ========================================================
     1 — EN-TÊTES DES JOURS
     ======================================================== */

  dayData.forEach(
    data => {

      const header =
        document.createElement(
          'div'
        );


      header.className =
        `day-header day-${data.day.key}`;


      const name =
        document.createElement(
          'span'
        );


      name.textContent =
        data.day.name;


      const count =
        document.createElement(
          'span'
        );


      count.className =
        'day-header-count';


      count.textContent =

        `${data.activities.length} ${
          data.activities.length > 1
            ? 'activités'
            : 'activité'
        }`;


      header.appendChild(
        name
      );


      header.appendChild(
        count
      );


      grid.appendChild(
        header
      );

    }
  );


  /* ========================================================
     2 — MATIN
     ======================================================== */

  for (
    const data
    of dayData
  ) {

    grid.appendChild(
      await createPeriodCell(
        data.day,
        data.morning,
        'MATIN'
      )
    );

  }


  /* ========================================================
     3 — BANDEAU REPAS
     ======================================================== */

  const meal =
    document.createElement(
      'div'
    );


  meal.className =
    'meal-row';


  meal.textContent =
    '12 h • Repas';


  grid.appendChild(
    meal
  );


  /* ========================================================
     4 — APRÈS-MIDI
     ======================================================== */

  for (
    const data
    of dayData
  ) {

    grid.appendChild(
      await createPeriodCell(
        data.day,
        data.afternoon,
        'APRÈS-MIDI'
      )
    );

  }


  planning.appendChild(
    grid
  );


  /* ========================================================
     AFFICHAGE
     ======================================================== */

  document
    .getElementById(
      'status'
    )
    .classList.add(
      'hidden'
    );


  document
    .getElementById(
      'sheet'
    )
    .classList.remove(
      'hidden'
    );

}


/* ============================================================
   CHARGEMENT GRIST
   ============================================================ */

async function load() {

  try {

    attachmentTokenInfo =
      null;


    attachmentCache.clear();


    const entries =
      await Promise.all(

        Object.entries(
          TABLES
        )
        .map(

          async (
            [
              key,
              tableName
            ]
          ) => {

            try {

              const table =
                await grist.docApi
                  .fetchTable(
                    tableName
                  );


              return [

                key,

                rowsFromTable(
                  table
                )

              ];

            }

            catch (error) {

              console.warn(
                `Table ${tableName} inaccessible`,
                error
              );


              return [
                key,
                []
              ];

            }

          }

        )

      );


    state =
      Object.fromEntries(
        entries
      );


    if (
      !state.activities.length
    ) {

      throw new Error(
        'La table Activites est vide ou inaccessible.'
      );

    }


    await render();

  }

  catch (error) {

    console.error(
      error
    );


    document
      .getElementById(
        'sheet'
      )
      .classList.add(
        'hidden'
      );


    const status =
      document.getElementById(
        'status'
      );


    status.textContent =
      'Impossible de charger le planning collectif.';


    status.classList.remove(
      'hidden'
    );

  }

}


/* ============================================================
   BOUTON IMPRESSION
   ============================================================ */

document
  .getElementById(
    'printButton'
  )
  .addEventListener(

    'click',

    () => {

      window.print();

    }

  );


/* ============================================================
   INITIALISATION GRIST
   ============================================================ */

grist.ready({

  requiredAccess:
    'read table'

});


/* ============================================================
   DÉMARRAGE
   ============================================================ */

load();