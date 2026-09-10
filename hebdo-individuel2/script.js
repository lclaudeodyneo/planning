/*
  Planning individuel — SAJ Anagallis
  Version raccordée au fichier Grist fourni.

  Structure utilisée :
  - Usagers
  - Annees
  - Participations -> Activites
  - Activites -> Jours_de_la_semaine / Heures / Animateurs
  - Reeducations -> Activites_autres / Jours_de_la_semaine / Heures / Reeducateurs

  Le widget est en lecture seule. L'accès "full" est nécessaire pour lire
  plusieurs tables du document via grist.docApi.fetchTable().
*/

(() => {
  "use strict";

  const COLORS = {
    accent: "#711aa2",
    1: "#5b8def", // lundi
    2: "#55a868", // mardi
    3: "#c77cff", // mercredi
    4: "#e6a23c", // jeudi
    5: "#e66b6b"  // vendredi
  };

  const DAYS = [
    {number: 1, key: "lundi", label: "Lundi"},
    {number: 2, key: "mardi", label: "Mardi"},
    {number: 3, key: "mercredi", label: "Mercredi"},
    {number: 4, key: "jeudi", label: "Jeudi"},
    {number: 5, key: "vendredi", label: "Vendredi"}
  ];

  const TABLES = {
    users: "Usagers",
    years: "Annees",
    participations: "Participations",
    activities: "Activites",
    days: "Jours_de_la_semaine",
    times: "Heures",
    animators: "Animateurs",
    reeducations: "Reeducations",
    reeducationTypes: "Activites_autres",
    reeducators: "Reeducateurs"
  };

  const state = {
    rows: {},
    byId: {},
    selectedUserId: null,
    selectedYearId: null,
    currentYearId: null,
    tokenInfo: null,
    refreshTimer: null
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    buildWeekSkeleton();
    bindUI();
    initializeGrist();
  });

  function cacheElements() {
    [
      "userSelect", "yearSelect", "printButton", "status",
      "planningTitle", "userFullName", "portrait", "portraitFallback",
      "weekGrid", "emptyState", "fatalError", "printViewport", "printInner"
    ].forEach(id => els[id] = document.getElementById(id));
  }

  function bindUI() {
    els.userSelect.addEventListener("change", async () => {
      state.selectedUserId = Number(els.userSelect.value) || null;
      await renderPlanning();
    });

    els.yearSelect.addEventListener("change", async () => {
      state.selectedYearId = Number(els.yearSelect.value) || null;
      await renderPlanning();
    });

    els.printButton.addEventListener("click", prepareAndPrint);
    window.addEventListener("beforeprint", fitPrintContent);
    window.addEventListener("afterprint", resetPrintFit);
  }

  function initializeGrist() {
    if (!window.grist) {
      fatal("L’API Grist n’est pas disponible. Ouvrez cette page comme widget personnalisé dans Grist.");
      return;
    }

    grist.ready({requiredAccess: "full"});

    // Le widget peut être lié à n'importe quelle table. onRecords nous sert
    // seulement de signal de rafraîchissement ; les vraies données sont lues
    // directement dans les tables du document.
    grist.onRecords(() => scheduleRefresh());
    setTimeout(() => refreshAll().catch(handleError), 200);
  }

  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => refreshAll().catch(handleError), 180);
  }

  async function refreshAll() {
    setStatus("Chargement des données…");
    clearFatal();

    const existingTables = await grist.docApi.listTables();
    for (const tableId of Object.values(TABLES)) {
      if (!existingTables.includes(tableId)) {
        throw new Error(`Table Grist introuvable : ${tableId}`);
      }
    }

    const entries = await Promise.all(
      Object.entries(TABLES).map(async ([key, tableId]) => {
        const data = await grist.docApi.fetchTable(tableId);
        return [key, columnarToRows(data)];
      })
    );

    for (const [key, rows] of entries) {
      state.rows[key] = rows;
      state.byId[key] = new Map(rows.map(row => [Number(row.id), row]));
    }

    state.tokenInfo = await grist.docApi.getAccessToken({readOnly: true});

    populateUserSelect();
    populateYearSelect();
    await renderPlanning();

    els.userSelect.disabled = state.rows.users.length === 0;
    els.yearSelect.disabled = state.rows.years.length === 0;
    els.printButton.disabled = !state.selectedUserId || !state.selectedYearId;
  }

  function columnarToRows(data) {
    if (!data || !Array.isArray(data.id)) return [];

    return data.id.map((id, index) => {
      const row = {id};
      for (const [column, values] of Object.entries(data)) {
        if (!Array.isArray(values)) continue;
        row[column] = decode(values[index]);
      }
      return row;
    });
  }

  function decode(value) {
    try {
      return typeof grist.decodeObject === "function" ? grist.decodeObject(value) : value;
    } catch {
      return value;
    }
  }

  function populateUserSelect() {
    const previous = state.selectedUserId;

    const users = state.rows.users
      .filter(user => !truthyBool(user.Parti_e))
      .sort((a, b) =>
        text(a.Nom).localeCompare(text(b.Nom), "fr", {sensitivity: "base"}) ||
        text(a.Prenom).localeCompare(text(b.Prenom), "fr", {sensitivity: "base"})
      );

    els.userSelect.innerHTML = "";

    if (!users.length) {
      addOption(els.userSelect, "", "Aucun usager actif");
      state.selectedUserId = null;
      return;
    }

    for (const user of users) {
      addOption(els.userSelect, String(user.id), userDisplayName(user));
    }

    state.selectedUserId = users.some(u => Number(u.id) === Number(previous))
      ? Number(previous)
      : Number(users[0].id);

    els.userSelect.value = String(state.selectedUserId);
  }

  function populateYearSelect() {
    const previous = state.selectedYearId;
    const years = [...state.rows.years].sort(compareYearsDesc);

    state.currentYearId = Number(years.find(y => normalize(y.Etat) === "actuel")?.id) || null;

    els.yearSelect.innerHTML = "";

    if (!years.length) {
      addOption(els.yearSelect, "", "Aucune année");
      state.selectedYearId = null;
      return;
    }

    for (const year of years) {
      const suffix = Number(year.id) === state.currentYearId ? " — actuel" : "";
      addOption(els.yearSelect, String(year.id), `${text(year.Annee)}${suffix}`);
    }

    if (years.some(y => Number(y.id) === Number(previous))) {
      state.selectedYearId = Number(previous);
    } else if (state.currentYearId) {
      state.selectedYearId = state.currentYearId;
    } else {
      state.selectedYearId = Number(years[0].id);
    }

    els.yearSelect.value = String(state.selectedYearId);
  }

  function compareYearsDesc(a, b) {
    const da = numericDate(a.Debut);
    const db = numericDate(b.Debut);
    if (da !== db) return db - da;
    return text(b.Annee).localeCompare(text(a.Annee), "fr", {numeric: true});
  }

  function numericDate(value) {
    if (typeof value === "number") return value;
    const d = new Date(value || 0);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  async function renderPlanning() {
    clearFatal();
    clearActivities();

    const user = state.byId.users?.get(Number(state.selectedUserId));
    const year = state.byId.years?.get(Number(state.selectedYearId));

    if (!user || !year) {
      els.planningTitle.textContent = "Planning";
      els.userFullName.textContent = "Sélectionnez une personne";
      els.emptyState.hidden = true;
      els.printButton.disabled = true;
      return;
    }

    els.planningTitle.textContent = `Planning ${text(year.Annee)}`;
    els.userFullName.textContent = userDisplayName(user);
    await renderPortrait(user);

    const models = [
      ...activityModelsFor(user, year),
      ...reeducationModelsFor(user, year)
    ].filter(item => item.dayNumber >= 1 && item.dayNumber <= 5);

    models.sort((a, b) =>
      a.dayNumber - b.dayNumber ||
      a.halfOrder - b.halfOrder ||
      a.sortMinutes - b.sortMinutes ||
      a.title.localeCompare(b.title, "fr")
    );

    const buckets = new Map();
    for (const day of DAYS) {
      buckets.set(`${day.key}:matin`, []);
      buckets.set(`${day.key}:apres-midi`, []);
    }

    for (const model of models) {
      const day = DAYS.find(d => d.number === model.dayNumber);
      if (!day) continue;
      const bucket = `${day.key}:${model.half}`;
      buckets.get(bucket)?.push(model);
    }

    renderBuckets(buckets);
    applyDensity(buckets);

    els.emptyState.hidden = models.length !== 0;
    els.printButton.disabled = false;

    const rehabNote = Number(year.id) !== Number(state.currentYearId)
      ? " Rééducations non affichées pour cette année : la table Reeducations n'est pas historisée par année."
      : "";

    setStatus(`${models.length} élément${models.length > 1 ? "s" : ""} affiché${models.length > 1 ? "s" : ""}.${rehabNote}`);
  }

  function activityModelsFor(user, year) {
    const result = [];

    for (const participation of state.rows.participations) {
      if (Number(participation.Annee) !== Number(year.id)) continue;
      if (!refListIds(participation.Participants).includes(Number(user.id))) continue;

      const activity = state.byId.activities.get(Number(participation.Activites));
      if (!activity) continue;

      // Double sécurité : si l'activité elle-même possède une année, elle doit
      // correspondre à l'année sélectionnée. Une cellule vide reste acceptée.
      if (activity.Annee && Number(activity.Annee) !== Number(year.id)) continue;

      const day = state.byId.days.get(Number(activity.Jour));
      const start = timeLabel(activity.Heure_debut);
      const end = timeLabel(activity.Heure_fin);
      const minutes = parseMinutes(start);

      result.push({
        source: "activity",
        title: text(activity.Nom_activite) || "Activité",
        timeText: formatRange(start, end),
        dayNumber: Number(day?.Num_jour) || Number(activity.Numero_du_jour_de_la_semaine) || 0,
        half: halfFromMinutes(minutes),
        halfOrder: halfFromMinutes(minutes) === "matin" ? 0 : 1,
        sortMinutes: Number.isFinite(minutes) ? minutes : 99999,
        people: animatorNames(activity.Animateur_s),
        // Dans ce document, la colonne Ressource joue le rôle de lieu / ressource
        // logistique (salle, gymnase, véhicule, bureau...).
        place: choiceListText(activity.Ressource),
        notes: text(activity.Remarques_planning),
        visualUrl: attachmentUrl(activity.Visuel),
        visualLabel: ""
      });
    }

    return result;
  }

  function reeducationModelsFor(user, year) {
    // La table Reeducations ne contient pas de colonne Annee. Pour éviter
    // d'afficher les rendez-vous actuels dans un ancien planning, on ne les
    // intègre que lorsque l'année sélectionnée est l'année marquée "Actuel".
    if (!state.currentYearId || Number(year.id) !== Number(state.currentYearId)) return [];

    const result = [];

    for (const rehab of state.rows.reeducations) {
      if (Number(rehab.Usagers) !== Number(user.id)) continue;

      const type = state.byId.reeducationTypes.get(Number(rehab.Type));
      const day = state.byId.days.get(Number(rehab.Jour));
      const start = timeLabel(rehab.Horaire);
      const minutes = parseMinutes(start);
      const reeducator = state.byId.reeducators.get(Number(rehab.Partenaire));

      result.push({
        source: "reeducation",
        title: text(type?.Type) || text(rehab.gristHelper_Display6) || "Rééducation",
        timeText: start || text(rehab.gristHelper_Display3),
        dayNumber: Number(day?.Num_jour) || Number(rehab.Jour_Num_jour) || Number(rehab.Num_du_jour) || 0,
        half: halfFromMinutes(minutes),
        halfOrder: halfFromMinutes(minutes) === "matin" ? 0 : 1,
        sortMinutes: Number.isFinite(minutes) ? minutes : 99999,
        people: text(reeducator?.Partenaire) || text(rehab.gristHelper_Display4),
        place: text(rehab.Lieu),
        notes: "",
        visualUrl: attachmentUrl(type?.Visuel_act_autre),
        visualLabel: ""
      });
    }

    return result;
  }

  function animatorNames(value) {
    const ids = refListIds(value);
    return ids
      .map(id => state.byId.animators.get(id))
      .filter(Boolean)
      .map(animator => text(animator.Nom2) || `${text(animator.Prenom)} ${text(animator.Nom).toUpperCase()}`.trim())
      .filter(Boolean)
      .join(", ");
  }

  function timeLabel(timeRef) {
    if (!timeRef) return "";
    const timeRow = state.byId.times.get(Number(timeRef));
    return text(timeRow?.Heures);
  }

  function formatRange(start, end) {
    if (start && end && start !== end) return `${start} - ${end}`;
    return start || end || "";
  }

  function parseMinutes(value) {
    const s = text(value).trim().toLowerCase();
    if (!s) return NaN;

    let match = s.match(/(\d{1,2})\s*[h:]\s*(\d{2})/);
    if (match) return Number(match[1]) * 60 + Number(match[2]);

    match = s.match(/^(\d{1,2})\s*h?$/);
    if (match) return Number(match[1]) * 60;

    return NaN;
  }

  function halfFromMinutes(minutes) {
    // L'affichage demandé est divisé par le bandeau REPAS MIDI.
    // Un rendez-vous avant 12 h 30 est classé le matin.
    return Number.isFinite(minutes) && minutes < 12 * 60 + 30 ? "matin" : "apres-midi";
  }

  function renderBuckets(buckets) {
    for (const day of DAYS) {
      for (const half of ["matin", "apres-midi"]) {
        const list = document.querySelector(`[data-list="${day.key}:${half}"]`);
        if (!list) continue;
        list.innerHTML = "";

        const items = buckets.get(`${day.key}:${half}`) || [];
        for (const item of items) list.appendChild(activityCard(item));
      }
    }
  }

  function activityCard(item) {
    const card = document.createElement("article");
    card.className = `activity-card${item.visualUrl ? "" : " no-visual"}`;

    const main = document.createElement("div");
    main.className = "activity-main";

    const title = document.createElement("div");
    title.className = "activity-title";
    title.textContent = item.title;
    main.appendChild(title);

    if (item.timeText) {
      const time = document.createElement("div");
      time.className = "activity-time";
      time.textContent = item.timeText;
      main.appendChild(time);
    }

    if (item.people) main.appendChild(metaLine("Avec", item.people));
    if (item.place) main.appendChild(metaLine("Lieu", item.place));
    if (item.notes) main.appendChild(metaLine("Remarque", item.notes));

    card.appendChild(main);

    if (item.visualUrl) {
      const wrap = document.createElement("div");
      wrap.className = "activity-visual-wrap";

      const img = document.createElement("img");
      img.className = "activity-visual";
      img.alt = item.visualLabel || "";
      img.src = item.visualUrl;
      img.loading = "eager";
      img.addEventListener("error", () => {
        wrap.remove();
        card.classList.add("no-visual");
      }, {once: true});

      wrap.appendChild(img);
      card.appendChild(wrap);
    }

    return card;
  }

  function metaLine(label, value) {
    const line = document.createElement("div");
    line.className = "activity-meta";

    const strong = document.createElement("strong");
    strong.textContent = `${label} : `;
    line.appendChild(strong);
    line.appendChild(document.createTextNode(text(value)));

    return line;
  }

  function buildWeekSkeleton() {
    els.weekGrid.innerHTML = "";

    for (const day of DAYS) {
      const header = document.createElement("div");
      header.className = "day-header";
      header.style.backgroundColor = COLORS[day.number];
      header.textContent = day.label;
      els.weekGrid.appendChild(header);
    }

    for (const day of DAYS) {
      els.weekGrid.appendChild(slotBlock(day, "matin", "top"));
    }

    const meal = document.createElement("div");
    meal.className = "meal-band";
    meal.textContent = "REPAS MIDI";
    els.weekGrid.appendChild(meal);

    for (const day of DAYS) {
      els.weekGrid.appendChild(slotBlock(day, "apres-midi", "bottom"));
    }
  }

  function slotBlock(day, half, extraClass) {
    const block = document.createElement("div");
    block.className = `schedule-slot ${extraClass}`;

    const list = document.createElement("div");
    list.className = "activity-list";
    list.dataset.list = `${day.key}:${half}`;

    block.appendChild(list);
    return block;
  }

  function clearActivities() {
    document.querySelectorAll(".activity-list").forEach(list => {
      list.innerHTML = "";
    });
  }

  async function renderPortrait(user) {
    els.portrait.hidden = true;
    els.portrait.removeAttribute("src");
    els.portraitFallback.hidden = false;
    els.portraitFallback.textContent = initials(userDisplayName(user)) || "?";

    const url = attachmentUrl(user.Portrait);
    if (!url) return;

    els.portrait.onload = () => {
      els.portraitFallback.hidden = true;
      els.portrait.hidden = false;
    };

    els.portrait.onerror = () => {
      els.portrait.hidden = true;
      els.portraitFallback.hidden = false;
    };

    els.portrait.src = url;
  }

  function attachmentUrl(value) {
    const ids = refListIds(value);
    if (!ids.length || !state.tokenInfo?.baseUrl || !state.tokenInfo?.token) return "";

    return `${state.tokenInfo.baseUrl}/attachments/${ids[0]}/download?auth=${encodeURIComponent(state.tokenInfo.token)}`;
  }

  function refListIds(value) {
    if (value == null || value === "") return [];

    if (Array.isArray(value)) {
      const values = value[0] === "L" ? value.slice(1) : value;
      return values.map(Number).filter(n => Number.isFinite(n) && n > 0);
    }

    // Tolérance supplémentaire utile avec certains exports / proxys Grist :
    // une liste peut exceptionnellement arriver sous forme de texte "[1,2]".
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map(Number).filter(n => Number.isFinite(n) && n > 0);
          }
        } catch {
          // On poursuit avec la conversion simple ci-dessous.
        }
      }
    }

    const single = Number(value);
    return Number.isFinite(single) && single > 0 ? [single] : [];
  }

  function choiceListText(value) {
    if (value == null || value === "") return "";

    if (Array.isArray(value)) {
      const values = value[0] === "L" ? value.slice(1) : value;
      return values.map(text).filter(Boolean).join(", ");
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean).join(", ");
        } catch {
          // Ce n'est pas du JSON : on affiche le texte tel quel.
        }
      }
    }

    return text(value);
  }

  function userDisplayName(user) {
    const formulaValue = text(user.Usager);
    if (formulaValue) return formulaValue;
    return `${text(user.Prenom)} ${text(user.Nom).toUpperCase()}`.trim();
  }

  function initials(name) {
    return text(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join("");
  }

  function truthyBool(value) {
    return value === true || value === 1 || normalize(value) === "true" || normalize(value) === "vrai" || normalize(value) === "oui";
  }

  function text(value) {
    return value == null ? "" : String(value).trim();
  }

  function normalize(value) {
    return text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function applyDensity(buckets) {
    els.printInner.classList.remove("density-compact", "density-ultra");

    const counts = Array.from(buckets.values()).map(items => items.length);
    const maxInHalfDay = Math.max(0, ...counts);
    const total = counts.reduce((sum, count) => sum + count, 0);

    if (maxInHalfDay >= 5 || total >= 24) {
      els.printInner.classList.add("density-ultra");
    } else if (maxInHalfDay >= 4 || total >= 18) {
      els.printInner.classList.add("density-compact");
    }
  }

  async function prepareAndPrint() {
    setStatus("Préparation de l’impression A4…");
    await waitForImages(350);
    fitPrintContent();
    window.print();
  }

  async function waitForImages(timeoutMs) {
    const images = [...document.querySelectorAll("#printInner img")].filter(img => !img.complete);
    if (!images.length) return;

    await Promise.race([
      Promise.all(images.map(img => new Promise(resolve => {
        img.addEventListener("load", resolve, {once: true});
        img.addEventListener("error", resolve, {once: true});
      }))),
      new Promise(resolve => setTimeout(resolve, timeoutMs))
    ]);
  }

  function fitPrintContent() {
    resetPrintFit();

    const pxPerMm = 96 / 25.4;
    const targetWidth = 287 * pxPerMm;
    const targetHeight = 200 * pxPerMm;

    const width = els.printInner.scrollWidth || els.printInner.getBoundingClientRect().width;
    const height = els.printInner.scrollHeight || els.printInner.getBoundingClientRect().height;
    if (!width || !height) return;

    const scale = Math.min(1, targetWidth / width, targetHeight / height);
    els.printInner.style.transform = `scale(${Math.max(scale, 0.68)})`;
  }

  function resetPrintFit() {
    if (els.printInner) els.printInner.style.transform = "";
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  function fatal(message) {
    els.fatalError.hidden = false;
    els.fatalError.textContent = message;
    setStatus("Erreur de configuration.");
  }

  function clearFatal() {
    els.fatalError.hidden = true;
    els.fatalError.textContent = "";
  }

  function handleError(error) {
    console.error(error);
    fatal(error?.message || String(error));
  }
})();
