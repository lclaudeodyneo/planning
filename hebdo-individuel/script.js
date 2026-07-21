const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

let allRecords = [];

const normalize = (value) => String(value ?? "").trim();

function personValue(record) {
  return normalize(record.Personne);
}

function minutes(value) {
  if (value === null || value === undefined || value === "") return 9999;

  // Une heure Grist peut arriver en secondes depuis minuit.
  if (typeof value === "number") return Math.floor(value / 60);

  const match = normalize(value).match(/(\d{1,2})[:h](\d{2})/i);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 9999;
}

function formatTime(value) {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "number") {
    const totalMinutes = Math.floor(value / 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  return normalize(value).replace(/h/i, ":");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Transforme la valeur d'une colonne Pièces jointes Grist en URL.
 * La colonne peut être vide, contenir un identifiant, ou une liste Grist ["L", id...].
 */
function attachmentUrl(value) {
  if (!value) return "";

  // Une URL déjà exploitable peut être utilisée directement.
  if (typeof value === "string" && /^(https?:|data:|blob:)/i.test(value)) return value;

  let attachmentId = null;

  if (Array.isArray(value)) {
    const ids = value[0] === "L" ? value.slice(1) : value;
    attachmentId = ids.find(item => Number.isInteger(item) || /^\d+$/.test(String(item)));
  } else if (Number.isInteger(value) || /^\d+$/.test(String(value))) {
    attachmentId = value;
  }

  if (!attachmentId) return "";
  return `https://docs.getgrist.com/attachments/${attachmentId}/download`;
}

function refreshPeople() {
  const select = document.getElementById("personSelect");
  const previous = select.value;

  const people = [...new Set(allRecords.map(personValue).filter(Boolean))]
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
  const selected = document.getElementById("personSelect").value;
  const week = document.getElementById("week");

  document.getElementById("personName").textContent = selected
    ? `Planning hebdomadaire – ${selected}`
    : "Planning hebdomadaire";

  if (!selected) {
    week.innerHTML = '<div class="message">Aucun usager trouvé. Vérifiez que le widget est relié à la table Planning et que les colonnes sont correctement associées.</div>';
    return;
  }

  const records = allRecords.filter(record => personValue(record) === selected);
  week.innerHTML = "";

  DAYS.forEach(dayName => {
    const day = document.createElement("section");
    day.className = "day";

    const heading = document.createElement("h2");
    heading.textContent = dayName;
    day.appendChild(heading);

    const items = document.createElement("div");
    items.className = "items";

    const dayRecords = records
      .filter(record => normalize(record.Jour).toLowerCase() === dayName.toLowerCase())
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

        const color = normalize(record.Couleur);
        if (color) card.style.borderColor = color;

        const imageUrl = attachmentUrl(record.Image);
        if (imageUrl) {
          const img = document.createElement("img");
          img.src = imageUrl;
          img.alt = normalize(record.Activite)
            ? `Visuel de l'activité ${normalize(record.Activite)}`
            : "Visuel de l'activité";
          img.className = "activity-image";
          img.addEventListener("error", () => img.remove());
          card.appendChild(img);
        }

        const start = formatTime(record.Debut);
        const end = formatTime(record.Fin);
        const timeText = start && end ? `${start} – ${end}` : (start || end);

        const time = document.createElement("div");
        time.className = "time";
        time.textContent = timeText || "Horaire non renseigné";

        const title = document.createElement("div");
        title.className = "title";
        title.textContent = normalize(record.Activite) || "Activité";

        card.appendChild(time);
        card.appendChild(title);

        const details = [];
        if (normalize(record.Lieu)) details.push(`Lieu : ${normalize(record.Lieu)}`);
        if (normalize(record.Professionnel)) details.push(`Avec : ${normalize(record.Professionnel)}`);
        if (normalize(record.Notes)) details.push(normalize(record.Notes));

        if (details.length) {
          const detail = document.createElement("div");
          detail.className = "detail";
          detail.innerHTML = details.map(item => `<div>${escapeHtml(item)}</div>`).join("");
          card.appendChild(detail);
        }

        items.appendChild(card);
      });
    }

    day.appendChild(items);
    week.appendChild(day);
  });
}

document.getElementById("personSelect").addEventListener("change", render);
document.getElementById("printButton").addEventListener("click", () => window.print());

grist.ready({
  requiredAccess: "read table",
  columns: [
    // Table Planning du fichier « Planning SAJ Anagallis.grist ».
    // Pour les références, associer les colonnes d'affichage calculées indiquées ci-dessous.
    { name: "Personne", title: "Usager (gristHelper_Display)", type: "Any" },
    { name: "Jour", title: "Jour", type: "Text" },
    { name: "Debut", title: "Début affiché (gristHelper_Display3)", type: "Any" },
    { name: "Fin", title: "Fin affichée (gristHelper_Display4)", type: "Any", optional: true },
    { name: "Activite", title: "Activité affichée (gristHelper_Display5)", type: "Any" },
    { name: "Lieu", title: "Lieu", type: "Text", optional: true },
    { name: "Professionnel", title: "Professionnels affichés (gristHelper_Display6)", type: "Any", optional: true },
    { name: "Couleur", title: "Couleur", type: "Text", optional: true },
    { name: "Notes", title: "Notes", type: "Text", optional: true },
    { name: "Image", title: "Image activité", type: "Any", optional: true }
  ]
});

grist.onRecords((records) => {
  allRecords = records || [];
  refreshPeople();
}, { mapping: true });
