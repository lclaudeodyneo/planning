/*
 * Widget Grist — Planning hebdomadaire individuel
 * Version adaptée à la table « Participations »
 *
 * Table principale du widget : Participations
 * Colonnes requises :
 *   - Activites    (référence vers Activites)
 *   - Participants (liste de références vers Usagers)
 */

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

let participationRecords = [];
let activitiesById = new Map();
let usersById = new Map();
let hoursById = new Map();
let daysById = new Map();
let animatorsById = new Map();
let initialized = false;

const normalize = value => String(value ?? "").trim();

/** Transforme une table Grist (objet de colonnes) en tableau de lignes. */
function tableToRows(table) {
  if (!table || !table.id || !Array.isArray(table.id)) return [];
  return table.id.map((id, index) => {
    const row = { id };
    Object.keys(table).forEach(column => {
      row[column] = table[column]?.[index];
    });
    return row;
  });
}

/** Extrait les identifiants d'une RefList Grist : ["L", 1, 2, 3]. */
function refList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    const values = value[0] === "L" ? value.slice(1) : value;
    return values
      .map(item => Number(item))
      .filter(item => Number.isFinite(item) && item > 0);
  }
  const single = Number(value);
  return Number.isFinite(single) && single > 0 ? [single] : [];
}

function refId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function userName(user) {
  if (!user) return "";
  return normalize(user.Usager) ||
    [normalize(user.Prenom), normalize(user.Nom).toUpperCase()]
      .filter(Boolean)
      .join(" ");
}

function animatorName(animator) {
  if (!animator) return "";
  return normalize(animator.Nom2) ||
    [normalize(animator.Prenom), normalize(animator.Nom).toUpperCase()]
      .filter(Boolean)
      .join(" ");
}

function getDayName(activity) {
  const day = daysById.get(refId(activity?.Jour));
  return normalize(day?.Jour) || normalize(activity?.gristHelper_Display2);
}

function getDayNumber(activity) {
  const direct = Number(activity?.Jour_Num_jour);
  if (Number.isFinite(direct)) return direct;
  const day = daysById.get(refId(activity?.Jour));
  const number = Number(day?.Num_jour);
  return Number.isFinite(number) ? number : 99;
}

function getHourText(reference, fallback) {
  const hour = hoursById.get(refId(reference));
  return normalize(hour?.Heures) || normalize(fallback);
}

function minutes(value) {
  if (value === null || value === undefined || value === "") return 9999;
  if (typeof value === "number") return Math.floor(value / 60);
  const match = normalize(value).match(/(\d{1,2})\s*[:h]\s*(\d{2})/i);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 9999;
}

function formatTime(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    const totalMinutes = Math.floor(value / 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }
  return normalize(value).replace(/\s*h\s*/i, ":");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/** Convertit une pièce jointe Grist en URL de téléchargement. */
function attachmentUrl(value) {
  if (!value) return "";
  if (typeof value === "string" && /^(https?:|data:|blob:)/i.test(value)) return value;

  const ids = Array.isArray(value)
    ? (value[0] === "L" ? value.slice(1) : value)
    : [value];

  const attachmentId = ids.find(item => /^\d+$/.test(String(item)) && Number(item) > 0);
  return attachmentId
    ? `https://docs.getgrist.com/attachments/${attachmentId}/download`
    : "";
}

function getAnimatorNames(activity) {
  return refList(activity?.Animateur_s)
    .map(id => animatorName(animatorsById.get(id)))
    .filter(Boolean)
    .join(", ") || normalize(activity?.gristHelper_Display);
}

/** Développe chaque ligne Participations en une ligne par participant. */
function buildIndividualRows() {
  const rows = [];

  participationRecords.forEach(participation => {
    const activityId = refId(participation.ActiviteRef);
    const activity = activitiesById.get(activityId);
    if (!activity) return;

    refList(participation.ParticipantsRef).forEach(userId => {
      const user = usersById.get(userId);
      const person = userName(user);
      if (!person) return;

      rows.push({
        Personne: person,
        PersonneId: userId,
        Portrait: user?.Portrait,
        Jour: getDayName(activity),
        JourNumero: getDayNumber(activity),
        Debut: getHourText(activity.Heure_debut, activity.gristHelper_Display3),
        Fin: getHourText(activity.Heure_fin, activity.gristHelper_Display4),
        Activite: normalize(activity.Nom_activite) || "Activité",
        Professionnel: getAnimatorNames(activity),
        Description: normalize(activity.Description),
        Image: activity.Visuel,
        Capacite: activity.Capacite
      });
    });
  });

  return rows;
}

function refreshPeople() {
  const select = document.getElementById("personSelect");
  if (!select) return;

  const previous = select.value;
  const people = [...new Set(buildIndividualRows().map(row => row.Personne).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

  select.innerHTML = "";
  people.forEach(person => {
    const option = document.createElement("option");
    option.value = person;
    option.textContent = person;
    select.appendChild(option);
  });

  if (people.includes(previous)) select.value = previous;
  else if (people.length) select.value = people[0];

  render();
}

function render() {
  const select = document.getElementById("personSelect");
  const week = document.getElementById("week");
  const personName = document.getElementById("personName");
  if (!select || !week || !personName) return;

  const selected = select.value;
  personName.textContent = selected
    ? `Planning hebdomadaire – ${selected}`
    : "Planning hebdomadaire";

  if (!selected) {
    week.innerHTML = '<div class="message">Aucun participant trouvé. Vérifiez les lignes de la table Participations et le paramétrage du widget.</div>';
    return;
  }

  const records = buildIndividualRows().filter(row => row.Personne === selected);
  week.innerHTML = "";

  DAYS.forEach((dayName, dayIndex) => {
    const section = document.createElement("section");
    section.className = "day";

    const heading = document.createElement("h2");
    heading.textContent = dayName;
    section.appendChild(heading);

    const items = document.createElement("div");
    items.className = "items";

    const dayRecords = records
      .filter(row => normalize(row.Jour).toLowerCase() === dayName.toLowerCase() || row.JourNumero === dayIndex + 1)
      .sort((a, b) => minutes(a.Debut) - minutes(b.Debut));

    if (!dayRecords.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Aucune activité";
      items.appendChild(empty);
    } else {
      dayRecords.forEach(record => {
        const card = document.createElement("article");
        card.className = "activity";

        const imageUrl = attachmentUrl(record.Image);
        if (imageUrl) {
          const img = document.createElement("img");
          img.src = imageUrl;
          img.alt = `Visuel de l’activité ${record.Activite}`;
          img.className = "activity-image";
          img.addEventListener("error", () => img.remove());
          card.appendChild(img);
        }

        const start = formatTime(record.Debut);
        const end = formatTime(record.Fin);
        const time = document.createElement("div");
        time.className = "time";
        time.textContent = start && end ? `${start} – ${end}` : (start || end || "Horaire non renseigné");

        const title = document.createElement("div");
        title.className = "title";
        title.textContent = record.Activite;

        card.appendChild(time);
        card.appendChild(title);

        const details = [];
        if (record.Professionnel) details.push(`Avec : ${record.Professionnel}`);
        if (record.Description) details.push(record.Description);

        if (details.length) {
          const detail = document.createElement("div");
          detail.className = "detail";
          detail.innerHTML = details.map(item => `<div>${escapeHtml(item)}</div>`).join("");
          card.appendChild(detail);
        }

        items.appendChild(card);
      });
    }

    section.appendChild(items);
    week.appendChild(section);
  });
}

async function loadLinkedTables() {
  try {
    const [activities, users, hours, days, animators] = await Promise.all([
      grist.docApi.fetchTable("Activites"),
      grist.docApi.fetchTable("Usagers"),
      grist.docApi.fetchTable("Heures"),
      grist.docApi.fetchTable("Jours_de_la_semaine"),
      grist.docApi.fetchTable("Animateurs")
    ]);

    activitiesById = new Map(tableToRows(activities).map(row => [Number(row.id), row]));
    usersById = new Map(tableToRows(users).map(row => [Number(row.id), row]));
    hoursById = new Map(tableToRows(hours).map(row => [Number(row.id), row]));
    daysById = new Map(tableToRows(days).map(row => [Number(row.id), row]));
    animatorsById = new Map(tableToRows(animators).map(row => [Number(row.id), row]));

    initialized = true;
    refreshPeople();
  } catch (error) {
    console.error("Impossible de charger les tables liées :", error);
    const week = document.getElementById("week");
    if (week) {
      week.innerHTML = `<div class="message">Erreur de lecture des tables liées : ${escapeHtml(error.message || String(error))}</div>`;
    }
  }
}

document.getElementById("personSelect")?.addEventListener("change", render);
document.getElementById("printButton")?.addEventListener("click", () => window.print());

grist.ready({
  requiredAccess: "read table",
  columns: [
    {
      name: "ActiviteRef",
      title: "Activité — colonne Activites",
      type: "Ref:Activites"
    },
    {
      name: "ParticipantsRef",
      title: "Participants — colonne Participants",
      type: "RefList:Usagers"
    }
  ]
});

grist.onRecords(records => {
  participationRecords = records || [];
  if (initialized) refreshPeople();
}, { mapping: true });

loadLinkedTables();
