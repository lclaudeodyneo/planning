const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
let allRecords = [];

const normalize = (value) => String(value ?? "").trim();
const personValue = (record) => normalize(record.Personne);

function minutes(value) {
  if (value === null || value === undefined || value === "") return 9999;
  if (typeof value === "number") {
    // Grist Time can arrive as seconds since midnight.
    return Math.floor(value / 60);
  }
  const match = String(value).match(/(\d{1,2})[:h](\d{2})/i);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 9999;
}

function formatTime(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    const totalMinutes = Math.floor(value / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  return normalize(value).replace("h", ":");
}

function refreshPeople() {
  const select = document.getElementById("personSelect");
  const previous = select.value;
  const people = [...new Set(allRecords.map(personValue).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr", {sensitivity: "base"}));

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
  document.getElementById("personName").textContent =
    selected ? `Planning hebdomadaire – ${selected}` : "Planning hebdomadaire";

  if (!selected) {
    week.innerHTML = '<div class="message">Aucune personne trouvée. Vérifiez le paramétrage des colonnes.</div>';
    return;
  }

  const records = allRecords.filter(r => personValue(r) === selected);
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
      .filter(r => normalize(r.Jour).toLowerCase() === dayName.toLowerCase())
      .sort((a, b) => minutes(a.Debut) - minutes(b.Debut));

    if (!dayRecords.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Aucune activité";
      items.appendChild(empty);
    } else {
      dayRecords.forEach(r => {
        const card = document.createElement("article");
        card.className = "activity";
        if (normalize(r.Couleur)) {
          card.style.borderColor = normalize(r.Couleur);
          card.style.background = normalize(r.Couleur);
          card.style.background = opacity(20%);
        }

        const start = formatTime(r.Debut);
        const end = formatTime(r.Fin);
        const timeText = start && end ? `${start} – ${end}` : (start || end);

        const time = document.createElement("div");
        time.className = "time";
        time.textContent = timeText || "Horaire non renseigné";

        const title = document.createElement("div");
        title.className = "title";
        title.textContent = normalize(r.Activite) || "Activité";

        card.appendChild(time);
        card.appendChild(title);

        const details = [];
        if (normalize(r.Salle)) details.push(`Salle : ${normalize(r.Salle)}`);
        if (normalize(r.Professionnel)) details.push(`Avec : ${normalize(r.Professionnel)}`);
        if (normalize(r.Notes)) details.push(normalize(r.Notes));

        if (details.length) {
          const detail = document.createElement("div");
          detail.className = "detail";
          detail.innerHTML = details.map(x => `<div>${escapeHtml(x)}</div>`).join("");
          card.appendChild(detail);

        // Ajout de l'image si disponible
        if (normalize(r.Image)) {
          const img = document.createElement("img");
          img.src = normalize(r.Image);
          img.alt = "Image de l'activité";
          img.style.maxWidth = "100%";
          img.style.height = "auto";
          img.style.marginBottom = "8px";
          img.style.borderRadius = "7px";
          card.appendChild(img);
        }

        }
        items.appendChild(card);
      });
    }

    day.appendChild(items);
    week.appendChild(day);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

document.getElementById("personSelect").addEventListener("change", render);
document.getElementById("printButton").addEventListener("click", () => window.print());

grist.ready({
  requiredAccess: "read table",
  columns: [
    {name: "Personne", title: "Personne", type: "Any"},
    {name: "Jour", title: "Jour", type: "Text"},
    {name: "Debut", title: "Heure de début", type: "Any"},
    {name: "Fin", title: "Heure de fin", type: "Any", optional: true},
    {name: "Activite", title: "Activité", type: "Any"},
    {name: "Salle", title: "Salle", type: "Any", optional: true},
    {name: "Professionnel", title: "Professionnel", type: "Any", optional: true},
    {name: "Couleur", title: "Couleur", type: "Text", optional: true},
    {name: "Notes", title: "Notes", type: "Text", optional: true},
    {name: "Image", title: "Image", type: "Any", optional: true}
  ]
});

grist.onRecords((records) => {
  allRecords = records || [];
  refreshPeople();
}, {mapping: true});
