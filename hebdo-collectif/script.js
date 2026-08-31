'use strict';


/* ============================================================
   PLANNING COLLECTIF
   SAJ ANAGALLIS

   Tables utilisées directement :

   Participations
      - Activites
      - Participants

   Activites
      - Nom_activite
      - Jour
      - Heure_debut
      - Heure_fin
      - Visuel

   Usagers
      - Prenom
      - Nom
      - Usager
      - Portrait

   Jours_de_la_semaine
      - Jour
      - Num_jour

   Heures
      - Heures
   ============================================================ */


/* ============================================================
   JOURS
   ============================================================ */

const DAYS = [

  {
    name: 'Lundi',
    color: '#7A4DA3'
  },

  {
    name: 'Mardi',
    color: '#2F80A8'
  },

  {
    name: 'Mercredi',
    color: '#348B68'
  },

  {
    name: 'Jeudi',
    color: '#D1842C'
  },

  {
    name: 'Vendredi',
    color: '#B64B5D'
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
   DONNÉES
   ============================================================ */

let state = {

  participations: [],

  activities: [],

  users: [],

  days: [],

  hours: [],

  animateurs: []

};


/* ============================================================
   IMAGES GRIST
   ============================================================ */

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
   CONVERTIT UNE TABLE GRIST EN TABLEAU DE LIGNES
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
   LISTES DE RÉFÉRENCES GRIST
   ============================================================ */

function listIds(value) {

  if (
    Array.isArray(value)
  ) {

    let list =
      value;


    /*
     * Les listes Grist sont généralement :
     *
     * ["L", 1, 2, 3]
     */

    if (
      value[0] === 'L' ||
      value[0] === 'l'
    ) {

      list =
        value.slice(1);

    }


    return list
      .flat()
      .map(Number)
      .filter(
        Number.isFinite
      );

  }


  const number =
    Number(value);


  if (
    Number.isFinite(number) &&
    number !== 0
  ) {

    return [
      number
    ];

  }


  return [];

}


/* ============================================================
   PREMIÈRE RÉFÉRENCE
   ============================================================ */

function firstId(value) {

  return (
    listIds(value)[0]
    ??
    null
  );

}


/* ============================================================
   INDEX PAR ID
   ============================================================ */

function byId(rows) {

  return new Map(

    rows.map(
      row => [
        row.id,
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

    Number(
      match[1]
    )
    *
    60

    +

    Number(
      match[2]
    )

  );

}


/* ============================================================
   TEXTE D'UNE RÉFÉRENCE
   ============================================================ */

function referenceText(
  value,
  rows,
  columns
) {

  const id =
    firstId(value);


  if (!id) {

    return normalize(value);

  }


  const row =
    byId(rows)
      .get(id);


  if (!row) {

    return '';

  }


  return normalize(

    get(
      row,
      ...columns
    )

  );

}


/* ============================================================
   HEURE D'UNE ACTIVITÉ
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


  /*
   * On essaie d'abord la colonne
   * d'affichage Grist.
   */

  const helperValue =
    normalize(
      get(
        activity,
        helper
      )
    );


  if (
    helperValue
  ) {

    return helperValue;

  }


  /*
   * Sinon on va directement
   * rechercher dans Heures.
   */

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
   JOUR D'UNE ACTIVITÉ
   ============================================================ */

function activityDay(
  activity
) {

  /*
   * Colonne helper si disponible.
   */

  const helper =
    normalize(

      get(
        activity,
        'gristHelper_Display2'
      )

    );


  if (
    helper
  ) {

    return helper;

  }


  /*
   * Sinon vraie référence Jour.
   */

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
   NOM COMPLET USAGER
   ============================================================ */

function userName(user) {

  if (!user) {

    return '';

  }


  /*
   * Ta table contient déjà
   * une colonne Usager.
   */

  const displayName =
    normalize(

      get(
        user,
        'Usager'
      )

    );


  if (
    displayName
  ) {

    return displayName;

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


/* ============================================================
   PRÉNOM
   ============================================================ */

function firstName(user) {

  const prenom =
    normalize(

      get(
        user,
        'Prenom',
        'Prénom'
      )

    );


  if (
    prenom
  ) {

    return prenom;

  }


  return userName(user);

}


/* ============================================================
   INITIALES SI PHOTO ABSENTE
   ============================================================ */

function initials(name) {

  return normalize(name)

    .split(/\s+/)

    .filter(Boolean)

    .slice(
      0,
      2
    )

    .map(

      word =>
        word
          .charAt(0)
          .toUpperCase()

    )

    .join('');

}


/* ============================================================
   URL SÉCURISÉE D'UNE PIÈCE JOINTE GRIST
   ============================================================ */

async function attachmentUrl(
  value
) {

  const id =
    listIds(value)[0];


  if (
    !id
  ) {

    return '';

  }


  /*
   * Cache :
   * évite de demander plusieurs fois
   * la même image.
   */

  if (
    attachmentCache.has(id)
  ) {

    return attachmentCache.get(id);

  }


  try {

    /*
     * On demande un token
     * de lecture Grist.
     */

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

  catch (
    error
  ) {

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

  const participantIds =
    new Set();


  /*
   * On parcourt Participations.
   */

  state.participations
    .forEach(

      participation => {

        /*
         * Activité associée
         * à cette ligne.
         */

        const participationActivityId =
          firstId(

            get(
              participation,
              'Activites'
            )

          );


        /*
         * Ce n'est pas notre activité.
         */

        if (
          participationActivityId
          !==
          activityId
        ) {

          return;

        }


        /*
         * On récupère tous
         * les participants.
         */

        const ids =
          listIds(

            get(
              participation,
              'Participants'
            )

          );


        ids.forEach(

          id =>
            participantIds.add(id)

        );

      }

    );


  /*
   * Conversion ID → ligne Usager.
   */

  const usersById =
    byId(
      state.users
    );


  return (
    [...participantIds]

      .map(

        id =>
          usersById.get(id)

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

              'fr',

              {
                sensitivity:
                  'base'
              }

            )

      )
  );

}


/* ============================================================
   CRÉATION D'UNE PERSONNE
   ============================================================ */

async function createParticipant(
  user
) {

  /*
   * Bloc général.
   */

  const person =
    document.createElement(
      'div'
    );


  person.className =
    'collective-person';


  /*
   * Cercle photo.
   */

  const portrait =
    document.createElement(
      'div'
    );


  portrait.className =
    'collective-person-photo';


  /*
   * Photo dans Usagers.Portrait.
   */

  const url =
    await attachmentUrl(

      get(
        user,
        'Portrait'
      )

    );


  if (
    url
  ) {

    const image =
      document.createElement(
        'img'
      );


    image.src =
      url;


    image.alt =
      userName(user);


    /*
     * Si l'image ne charge pas :
     * initiales.
     */

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


  /*
   * Prénom sous la photo.
   */

  const name =
    document.createElement(
      'div'
    );


  name.className =
    'collective-person-name';


  name.textContent =
    firstName(user);


  /*
   * Assemblage.
   */

  person.appendChild(
    portrait
  );


  person.appendChild(
    name
  );


  return person;

}


/* ============================================================
   CRÉATION CARTE ACTIVITÉ
   ============================================================ */

async function createActivityCard(
  activity,
  day
) {

  const card =
    document.createElement(
      'article'
    );


  card.className =
    'collective-activity';


  /*
   * Couleur du contour.
   */

  card.style.setProperty(

    '--activity-color',

    day.color

  );


  /* ========================================================
     EN-TÊTE
     ======================================================== */

  const header =
    document.createElement(
      'div'
    );


  header.className =
    'collective-activity-header';


  /* ========================================================
     PICTOGRAMME
     ======================================================== */

  const visual =
    document.createElement(
      'div'
    );


  visual.className =
    'collective-activity-visual';


  /*
   * Pictogramme :
   * Activites.Visuel
   */

  const visualUrl =
    await attachmentUrl(

      get(
        activity,
        'Visuel'
      )

    );


  if (
    visualUrl
  ) {

    const image =
      document.createElement(
        'img'
      );


    image.src =
      visualUrl;


    image.alt =
      `Pictogramme ${
        normalize(

          get(
            activity,
            'Nom_activite'
          )

        )
      }`;


    /*
     * Si pictogramme cassé,
     * on vide simplement la zone.
     */

    image.onerror =
      () => {

        visual.innerHTML =
          '';

      };


    visual.appendChild(
      image
    );

  }


  /* ========================================================
     TEXTE ACTIVITÉ
     ======================================================== */

  const information =
    document.createElement(
      'div'
    );


  information.className =
    'collective-activity-info';


  /*
   * Nom activité.
   */

  const title =
    document.createElement(
      'div'
    );


  title.className =
    'collective-activity-title';


  title.textContent =

    normalize(

      get(
        activity,
        'Nom_activite'
      )

    )

    ||

    'Activité';


  /*
   * Horaire.
   */

  const time =
    document.createElement(
      'div'
    );


  time.className =
    'collective-activity-time';


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
      start
      ||
      end
      ||
      '';

  }


  information.appendChild(
    title
  );


  if (
    time.textContent
  ) {

    information.appendChild(
      time
    );

  }


  header.appendChild(
    visual
  );


  header.appendChild(
    information
  );


  card.appendChild(
    header
  );


  /* ========================================================
     PARTICIPANTS
     ======================================================== */

  const participants =
    participantsForActivity(
      activity.id
    );


  const participantArea =
    document.createElement(
      'div'
    );


  participantArea.className =
    'collective-participants';


  if (
    participants.length === 0
  ) {

    const empty =
      document.createElement(
        'div'
      );


    empty.className =
      'collective-no-participant';


    empty.textContent =
      'Aucun participant';


    participantArea.appendChild(
      empty
    );

  }

  else {

    for (
      const participant
      of participants
    ) {

      const participantElement =
        await createParticipant(
          participant
        );


      participantArea.appendChild(
        participantElement
      );

    }

  }


  card.appendChild(
    participantArea
  );


  return card;

}


/* ============================================================
   CRÉATION MATIN / APRÈS-MIDI
   ============================================================ */

async function createPeriod(
  activities,
  day,
  label
) {

  const period =
    document.createElement(
      'section'
    );


  period.className =
    'collective-period';


  /*
   * Titre Matin / Après-midi.
   */

  const title =
    document.createElement(
      'div'
    );


  title.className =
    'collective-period-title';


  title.textContent =
    label;


  period.appendChild(
    title
  );


  /*
   * Liste activités.
   */

  const activitiesArea =
    document.createElement(
      'div'
    );


  activitiesArea.className =
    'collective-activity-list';


  if (
    activities.length === 0
  ) {

    const empty =
      document.createElement(
        'div'
      );


    empty.className =
      'collective-empty';


    empty.textContent =
      'Aucune activité';


    activitiesArea.appendChild(
      empty
    );

  }

  else {

    for (
      const activity
      of activities
    ) {

      const card =
        await createActivityCard(

          activity,

          day

        );


      activitiesArea.appendChild(
        card
      );

    }

  }


  period.appendChild(
    activitiesArea
  );


  return period;

}


/* ============================================================
   CRÉATION D'UNE JOURNÉE
   ============================================================ */

async function createDay(
  day
) {

  const section =
    document.createElement(
      'section'
    );


  section.className =
    'collective-day';


  section.style.setProperty(

    '--day-color',

    day.color

  );


  /* ========================================================
     NOM JOUR
     ======================================================== */

  const header =
    document.createElement(
      'header'
    );


  header.className =
    'collective-day-header';


  header.textContent =
    day.name;


  section.appendChild(
    header
  );


  /* ========================================================
     ACTIVITÉS DU JOUR
     ======================================================== */

  const activities =
    state.activities

      .filter(

        activity =>

          activityDay(activity)
            .toLowerCase()

          ===

          day.name
            .toLowerCase()

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


  /* ========================================================
     MATIN
     ======================================================== */

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

        12 * 60

    );


  /* ========================================================
     APRÈS-MIDI
     ======================================================== */

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

        12 * 60

    );


  const body =
    document.createElement(
      'div'
    );


  body.className =
    'collective-day-body';


  /* ========================================================
     MATIN
     ======================================================== */

  const morningSection =
    await createPeriod(

      morning,

      day,

      'Matin'

    );


  body.appendChild(
    morningSection
  );


  /* ========================================================
     REPAS
     ======================================================== */

  const meal =
    document.createElement(
      'div'
    );


  meal.className =
    'collective-meal';


  meal.textContent =
    '12 h · Repas';


  body.appendChild(
    meal
  );


  /* ========================================================
     APRÈS-MIDI
     ======================================================== */

  const afternoonSection =
    await createPeriod(

      afternoon,

      day,

      'Après-midi'

    );


  body.appendChild(
    afternoonSection
  );


  section.appendChild(
    body
  );


  return section;

}


/* ============================================================
   AFFICHAGE COMPLET
   ============================================================ */

async function render() {

  const week =
    document.getElementById(
      'week'
    );


  /*
   * On vide l'affichage.
   */

  week.innerHTML =
    '';


  /*
   * Conteneur 5 jours.
   */

  const daysGrid =
    document.createElement(
      'div'
    );


  daysGrid.className =
    'collective-days';


  /*
   * Lundi → vendredi.
   */

  for (
    const day
    of DAYS
  ) {

    const dayElement =
      await createDay(day);


    daysGrid.appendChild(
      dayElement
    );

  }


  week.appendChild(
    daysGrid
  );


  /*
   * Masquer message de chargement.
   */

  const status =
    document.getElementById(
      'status'
    );


  status.classList.add(
    'hidden'
  );


  /*
   * Afficher planning.
   */

  const sheet =
    document.getElementById(
      'sheet'
    );


  sheet.classList.remove(
    'hidden'
  );

}


/* ============================================================
   CHARGEMENT DES TABLES
   ============================================================ */

async function load() {

  try {

    /*
     * Réinitialisation images.
     */

    attachmentTokenInfo =
      null;


    attachmentCache.clear();


    /*
     * Lecture simultanée
     * des tables Grist.
     */

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

            catch (
              error
            ) {

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


    /*
     * Mise en mémoire.
     */

    state =
      Object.fromEntries(
        entries
      );


    /*
     * Vérification essentielle.
     */

    if (
      state.activities.length === 0
    ) {

      throw new Error(

        'La table Activites est vide ou inaccessible.'

      );

    }


    /*
     * Génération planning.
     */

    await render();

  }

  catch (
    error
  ) {

    console.error(
      error
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


    const sheet =
      document.getElementById(
        'sheet'
      );


    sheet.classList.add(
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

  /*
   * Le widget lit plusieurs tables.
   */

  requiredAccess:
    'read table'

});


/* ============================================================
   DÉMARRAGE
   ============================================================ */

load();