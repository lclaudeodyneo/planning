'use strict';


/* ============================================================
   PLANNING COLLECTIF
   5 PAGES A3
   UNE PAGE PAR JOUR
   ============================================================ */


/* ============================================================
   TABLES GRIST
   ============================================================ */

const TABLES = {

  participations:
    'Participations',

  activites:
    'Activites',

  usagers:
    'Usagers',

  jours:
    'Jours_de_la_semaine',

  heures:
    'Heures',

  animateurs:
    'Animateurs'

};


/* ============================================================
   JOURS
   ============================================================ */

const DAYS = [

  {
    name: 'Lundi',

    color:
      '#1598e2',

    background:
      'rgba(21,152,226,0.10)'
  },


  {
    name: 'Mardi',

    color:
      '#2bb447',

    background:
      'rgba(43,180,71,0.10)'
  },


  {
    name: 'Mercredi',

    color:
      '#c15bdf',

    background:
      'rgba(193,91,223,0.10)'
  },


  {
    name: 'Jeudi',

    color:
      '#eda820',

    background:
      'rgba(237,168,32,0.10)'
  },


  {
    name: 'Vendredi',

    color:
      '#d65357',

    background:
      'rgba(214,83,87,0.10)'
  }

];


/* ============================================================
   ÉTAT
   ============================================================ */

const state = {

  tables: {},

  activities: [],

  usersById:
    new Map(),

  attachmentUrls:
    new Map()

};


let attachmentTokenInfo =
  null;


const $ =
  id =>
    document.getElementById(id);


/* ============================================================
   CONVERSION TABLE GRIST
   ============================================================ */

function rowsFromTable(table) {

  if (
    !table
    ||
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
          key,
          value
        ]
        of Object.entries(table)
      ) {

        row[key] =
          Array.isArray(value)
            ? value[index]
            : value;

      }


      return row;

    }
  );

}


/* ============================================================
   RÉFÉRENCES GRIST
   ============================================================ */

function refIds(value) {

  if (
    value === null
    ||
    value === undefined
  ) {

    return [];

  }


  if (
    Array.isArray(value)
  ) {

    const values =

      value[0] === 'L'

        ?

        value.slice(1)

        :

        value;


    return values

      .flat()

      .map(Number)

      .filter(
        Number.isFinite
      );

  }


  const id =
    Number(value);


  return Number.isFinite(id)

    ?

    [id]

    :

    [];

}


/* ============================================================
   INDEX PAR IDENTIFIANT
   ============================================================ */

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
   TEXTE
   ============================================================ */

function text(
  value,
  fallback = ''
) {

  return (

    value === null
    ||
    value === undefined
    ||
    value === ''

  )

    ?

    fallback

    :

    String(value);

}


/* ============================================================
   HTML SÉCURISÉ
   ============================================================ */

function esc(value) {

  return text(value)

    .replace(

      /[&<>"']/g,

      character => ({

        '&':
          '&amp;',

        '<':
          '&lt;',

        '>':
          '&gt;',

        '"':
          '&quot;',

        "'":
          '&#039;'

      })[character]

    );

}


/* ============================================================
   JOUR
   ============================================================ */

function normalizeDay(value) {

  const normalized =
    text(value)
      .trim()
      .toLowerCase();


  const day =
    DAYS.find(

      item =>
        item.name
          .toLowerCase()

        ===

        normalized

    );


  return day
    ? day.name
    : text(value);

}


/* ============================================================
   HEURE EN MINUTES
   ============================================================ */

function minutes(value) {

  const match =
    text(value)
      .match(
        /(\d{1,2})\D(\d{2})/
      );


  if (
    !match
  ) {

    return 9999;

  }


  return (

    Number(match[1])
    *
    60

    +

    Number(match[2])

  );

}


/* ============================================================
   INITIALES
   ============================================================ */

function initials(name) {

  return text(
    name,
    '?'
  )

    .split(/\s+/)

    .filter(Boolean)

    .slice(0, 2)

    .map(
      part =>
        part.charAt(0)
    )

    .join('')

    .toUpperCase();

}


/* ============================================================
   COULEUR ACTIVITÉ
   ============================================================ */

function colorFor(name) {

  let hue = 0;


  for (
    const character
    of text(name)
  ) {

    hue =

      (
        hue * 31
        +
        character.charCodeAt(0)
      )

      %

      360;

  }


  return (
    `hsl(${hue} 48% 48%)`
  );

}


/* ============================================================
   IMAGE GRIST
   ============================================================ */

async function attachmentUrl(
  value
) {

  const ids =
    refIds(value);


  if (
    !ids.length
  ) {

    return '';

  }


  const id =
    ids[0];


  /*
   * Déjà en cache.
   */

  if (
    state.attachmentUrls
      .has(id)
  ) {

    return state
      .attachmentUrls
      .get(id);

  }


  try {

    /*
     * Token sécurisé Grist.
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


    state
      .attachmentUrls
      .set(
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
   CHARGEMENT DES TABLES
   ============================================================ */

async function fetchAll() {

  showStatus(
    'Lecture des tables Grist…'
  );


  attachmentTokenInfo =
    null;


  state
    .attachmentUrls
    .clear();


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

      )

    );


  state.tables =
    Object.fromEntries(
      entries
    );


  buildModel();


  await render();

}


/* ============================================================
   MODÈLE
   ============================================================ */

function buildModel() {

  const users =
    state.tables.usagers;


  const activities =
    state.tables.activites;


  const participations =
    state.tables.participations;


  const days =
    byId(
      state.tables.jours
    );


  const hours =
    byId(
      state.tables.heures
    );


  const animators =
    byId(
      state.tables.animateurs
    );


  state.usersById =
    byId(users);


  /* ========================================================
     PARTICIPANTS PAR ACTIVITÉ
     ======================================================== */

  const participantsByActivity =
    new Map();


  for (
    const participation
    of participations
  ) {

    const activityId =
      refIds(
        participation.Activites
      )[0];


    if (
      !activityId
    ) {

      continue;

    }


    const participants =

      participantsByActivity
        .get(activityId)

      ||

      new Set();


    refIds(
      participation.Participants
    )
    .forEach(

      participantId =>
        participants.add(
          Number(participantId)
        )

    );


    participantsByActivity
      .set(

        activityId,

        participants

      );

  }


  /* ========================================================
     ACTIVITÉS
     ======================================================== */

  state.activities =

    activities

      .map(

        activity => {


          /* JOUR */

          const dayRow =
            days.get(

              refIds(
                activity.Jour
              )[0]

            );


          /* HEURE DÉBUT */

          const startRow =
            hours.get(

              refIds(
                activity.Heure_debut
              )[0]

            );


          /* HEURE FIN */

          const endRow =
            hours.get(

              refIds(
                activity.Heure_fin
              )[0]

            );


          /* ANIMATEURS */

          const animatorNames =

            refIds(
              activity.Animateur_s
            )

            .map(
              id =>
                animators.get(
                  Number(id)
                )
            )

            .filter(Boolean)

            .map(

              animator => {

                const display =
                  text(
                    animator.Nom2
                  );


                if (
                  display
                ) {

                  return display;

                }


                return (
                  `${text(
                    animator.Prenom
                  )} ${text(
                    animator.Nom
                  )}`
                ).trim();

              }

            )

            .filter(Boolean);


          /* OBJET ACTIVITÉ */

          return {

            id:
              Number(activity.id),

            name:
              text(

                activity.Nom_activite,

                'Activité'

              ),

            day:
              normalizeDay(

                dayRow?.Jour

                ||

                activity
                  .gristHelper_Display2

              ),

            dayOrder:
              Number(

                activity
                  .Jour_Num_jour

                ||

                dayRow?.Num_jour

                ||

                99

              ),

            start:
              text(

                startRow?.Heures

                ||

                activity
                  .gristHelper_Display3

              ),

            end:
              text(

                endRow?.Heures

                ||

                activity
                  .gristHelper_Display4

              ),

            animators:
              animatorNames,

            visual:
              activity.Visuel,

            description:
              text(
                activity.Remarques_planning
              ),

            participants:

              participantsByActivity
                .get(
                  Number(activity.id)
                )

              ||

              new Set()

          };

        }

      )

      .sort(
        sortActivities
      );

}


/* ============================================================
   TRI DES ACTIVITÉS
   ============================================================ */

function sortActivities(
  a,
  b
) {

  return (

    a.dayOrder
    -
    b.dayOrder

    ||

    minutes(a.start)
    -
    minutes(b.start)

    ||

    a.name.localeCompare(
      b.name,
      'fr'
    )

  );

}


/* ============================================================
   MATIN / APRÈS-MIDI
   ============================================================ */

function periodOf(activity) {

  /*
   * Comme ton croquis :
   * avant 12 h = matin
   * à partir de 12 h = après-midi.
   */

  return (

    minutes(
      activity.start
    )

    <

    12 * 60

  )

    ?

    'Matin'

    :

    'ApresMidi';

}


/* ============================================================
   NOM D'UN USAGER
   ============================================================ */

function userFullName(user) {

  if (
    !user
  ) {

    return '';

  }


  return text(

    user.Usager,

    (
      `${text(
        user.Prenom
      )} ${text(
        user.Nom
      )}`
    ).trim()

  );

}


/* ============================================================
   PRÉNOM
   ============================================================ */

function userFirstName(user) {

  if (
    !user
  ) {

    return '';

  }


  return text(

    user.Prenom,

    userFullName(user)

  );

}


/* ============================================================
   PARTICIPANT
   ============================================================ */

async function participantHtml(
  participantId
) {

  const user =
    state.usersById
      .get(
        Number(participantId)
      );


  if (
    !user
  ) {

    return '';

  }


  const fullName =
    userFullName(user);


  const firstName =
    userFirstName(user);


  const portraitUrl =
    await attachmentUrl(
      user.Portrait
    );


  let portrait;


  if (
    portraitUrl
  ) {

    portrait = `

      <div class="participant-photo">

        <img
          src="${portraitUrl}"
          alt="${esc(fullName)}"
        >

      </div>

    `;

  }


  else {

    portrait = `

      <div class="participant-photo">

        ${esc(
          initials(fullName)
        )}

      </div>

    `;

  }


  return `

    <div class="participant">

      ${portrait}

      <div class="participant-name">

        ${esc(firstName)}

      </div>

    </div>

  `;

}


/* ============================================================
   CARTE ACTIVITÉ
   ============================================================ */

async function activityCard(
  activity
) {

  /* ========================================================
     PICTOGRAMME
     ======================================================== */

  const logo =
    await attachmentUrl(
      activity.visual
    );


  /* ========================================================
     HORAIRE
     ======================================================== */

  const schedule =
    [
      activity.start,
      activity.end
    ]

    .filter(Boolean)

    .join(
      ' – '
    );


  /* ========================================================
     COULEUR ACTIVITÉ
     ======================================================== */

  const cardColor =
    colorFor(
      activity.name
    );


  /* ========================================================
     PARTICIPANTS
     ======================================================== */

  const participantIds =
    [...activity.participants];


  const participantElements =
    await Promise.all(

      participantIds.map(
        participantHtml
      )

    );


  const participantsHtml =
    participantElements
      .filter(Boolean)
      .join('');


  /* ========================================================
     ANIMATEURS
     ======================================================== */

  let animatorHtml =
    '';


  if (
    activity.animators.length
  ) {

    animatorHtml = `

      <div class="activity-meta">

        <strong>

          Avec :

        </strong>

        ${esc(
          activity.animators
            .join(', ')
        )}

      </div>

    `;

  }


  /* ========================================================
     PICTOGRAMME HTML
     ======================================================== */

  const logoHtml =

    logo

      ?

      `

      <img
        class="activity-logo"
        src="${logo}"
        alt=""
      >

      `

      :

      '';


  /* ========================================================
     PARTICIPANTS HTML
     ======================================================== */

  const peopleHtml =

    participantsHtml

      ?

      `

      <div class="participants-title">

        Participant${
          participantIds.length > 1
            ? 's'
            : ''
        }

      </div>


      <div class="participants-grid">

        ${participantsHtml}

      </div>

      `

      :

      `

      <div class="participants-title">

        Participants

      </div>


      <div class="empty-slot">

        Aucun participant renseigné

      </div>

      `;


  /* ========================================================
     CARTE
     ======================================================== */

  return `

    <article

      class="activity-card"

      style="
        --card-color:
          ${cardColor};
      "

    >


      <div class="activity-header">


        <h3 class="activity-title">

          ${esc(
            activity.name
          )}

        </h3>


        ${
          schedule

            ?

            `

            <div class="activity-time">

              ${esc(schedule)}

            </div>

            `

            :

            ''
        }


        ${logoHtml}


      </div>


      ${animatorHtml}


      ${peopleHtml}


    </article>

  `;

}


/* ============================================================
   PÉRIODE
   ============================================================ */

async function periodHtml(
  title,
  activities
) {

  let activitiesHtml;


  if (
    activities.length
  ) {

    const cards =
      await Promise.all(

        activities.map(
          activityCard
        )

      );


    activitiesHtml =
      cards.join('');

  }


  else {

    activitiesHtml = `

      <div class="empty-slot">

        Aucune activité renseignée

      </div>

    `;

  }


  return `

    <section class="period">


      <div class="period-title">

        ${esc(title)}

      </div>


      <div class="activities-list">

        ${activitiesHtml}

      </div>


    </section>

  `;

}


/* ============================================================
   PAGE D'UN JOUR
   ============================================================ */

async function dayPage(
  day
) {

  /* ========================================================
     ACTIVITÉS DU JOUR
     ======================================================== */

  const activities =

    state.activities

      .filter(

        activity =>
          activity.day
          ===
          day.name

      )

      .sort(
        sortActivities
      );


  /* ========================================================
     MATIN
     ======================================================== */

  const morning =
    activities.filter(

      activity =>
        periodOf(activity)
        ===
        'Matin'

    );


  /* ========================================================
     APRÈS-MIDI
     ======================================================== */

  const afternoon =
    activities.filter(

      activity =>
        periodOf(activity)
        ===
        'ApresMidi'

    );


  /* ========================================================
     HTML PÉRIODES
     ======================================================== */

  const morningHtml =
    await periodHtml(
      'MATIN',
      morning
    );


  const afternoonHtml =
    await periodHtml(
      'APRÈS-MIDI',
      afternoon
    );


  /* ========================================================
     PAGE
     ======================================================== */

  return `

    <article

      class="day-page"

      style="
        --day-color:
          ${day.color};

        --day-background:
          ${day.background};
      "

    >


      <!-- JOUR -->

      <header class="day-title">

        ${esc(
          day.name
        )}

      </header>


      <!-- CONTENU -->

      <div class="day-body">


        <!-- MATIN -->

        ${morningHtml}


        <!-- REPAS -->

        <div class="meal-banner">

          12 h · Repas

        </div>


        <!-- APRÈS-MIDI -->

        ${afternoonHtml}


      </div>


      <!-- PIED DE PAGE -->

      <footer class="page-footer">

        Odynéo · Les Tourrais de Craponne ·
        Service d'accueil de jour Anagallis

      </footer>


    </article>

  `;

}


/* ============================================================
   RENDU DES 5 JOURS
   ============================================================ */

async function render() {

  const pages =
    $('pages');


  pages.innerHTML =
    '';


  /* ========================================================
     CRÉATION LUNDI → VENDREDI
     ======================================================== */

  const generatedPages =
    await Promise.all(

      DAYS.map(
        dayPage
      )

    );


  pages.innerHTML =
    generatedPages.join('');


  /* ========================================================
     AFFICHAGE
     ======================================================== */

  $('status')
    .classList
    .add(
      'hidden'
    );


  pages
    .classList
    .remove(
      'hidden'
    );

}


/* ============================================================
   STATUS
   ============================================================ */

function showStatus(
  message,
  error = false
) {

  const status =
    $('status');


  status.textContent =
    message;


  status
    .classList
    .toggle(
      'error',
      error
    );


  status
    .classList
    .remove(
      'hidden'
    );


  $('pages')
    .classList
    .add(
      'hidden'
    );

}


/* ============================================================
   ERREUR
   ============================================================ */

function showError(error) {

  console.error(
    error
  );


  showStatus(

    'Une erreur empêche l’affichage du planning.',

    true

  );


  $('errorText')
    .textContent =

      `${error?.message || error}

Vérifiez que les tables Grist portent exactement ces noms :

${Object.values(TABLES).join('\n')}`;


  $('errorDialog')
    .showModal();

}


/* ============================================================
   IMPRESSION
   ============================================================ */

$('printBtn')
  .addEventListener(

    'click',

    () => {

      window.print();

    }

  );


/* ============================================================
   GRIST
   ============================================================ */

grist.ready({

  /*
   * Nécessaire car plusieurs tables
   * sont lues directement.
   */

  requiredAccess:
    'full'

});


grist.onOptions(
  (
    _options,
    interaction
  ) => {

    if (
      interaction?.access_level

      &&

      interaction.access_level
      !==
      'full'
    ) {

      showStatus(

        'Autorisez « Accès complet au document » pour lire les tables liées.',

        true

      );

    }

  }
);


/* ============================================================
   DÉMARRAGE
   ============================================================ */

fetchAll()
  .catch(
    showError
  );