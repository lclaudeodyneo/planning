/* Planning individuel Grist — SAJ Anagallis
   ------------------------------------------------------------
   Ce widget est volontairement en LECTURE SEULE.
   Il demande "full" uniquement parce que Grist l'exige pour
   grist.docApi.fetchTable() sur plusieurs tables.
*/

(() => {
  "use strict";

  const CONFIG = {
    serviceName: "SAJ Anagallis",
    tables: {
      users: "Usagers",
      participations: "Participations"
    },
    colors: {
      accent: "#711aa2",
      lundi: "#5b8def",
      mardi: "#55a868",
      mercredi: "#c77cff",
      jeudi: "#e6a23c",
      vendredi: "#e66b6b"
    },

    /* Les alias ci-dessous permettent au widget de tolérer plusieurs
       intitulés de colonnes. Les noms EXACTS demandés sont placés en premier. */
    columns: {
      userDisplay: ["Usager", "Nom_complet", "Nom complet", "NomComplet", "Personne"],
      userLastName: ["Nom", "Nom_de_famille", "Nom de famille", "NomFamille"],
      userFirstName: ["Prenom", "Prénom", "Prenom_usager", "Prénom usager"],
      userLeft: ["Parti_e", "Parti.e", "Parti", "Partie", "Sorti_e", "Sorti"],
      userPortrait: ["Portrait", "Photo", "Photo_usager", "Photo usager", "Image"],

      yearState: ["Etat", "État"],
      yearLabel: ["Annee", "Année", "Annee_scolaire", "Année scolaire", "Libelle", "Libellé", "Nom"],

      participantUser: ["Usager", "Personne", "Participant", "Beneficiaire", "Bénéficiaire"],
      participantYear: ["Annee", "Année", "Annee_scolaire", "Année scolaire"],
      participantDay: ["Jour", "Jour_semaine", "Jour semaine", "Journée"],
      participantDate: ["Date", "Date_activite", "Date activité"],
      participantHalf: ["Demi_journee", "Demi-journée", "Demi journée", "Periode", "Période", "Moment"],

      /* Une participation peut pointer vers une activité, une autre activité
         ou une rééducation. Le widget cherche toutes les références renseignées. */
      activityRef: [
        "Activite", "Activité", "Activites", "Activités",
        "Activite_autre", "Activité autre", "Autre_activite", "Autre activité",
        "Reeducation", "Rééducation", "Reeducations", "Rééducations",
        "Rendez_vous", "Rendez-vous", "RDV"
      ],

      itemName: ["Nom", "Activite", "Activité", "Titre", "Libelle", "Libellé", "Reeducation", "Rééducation", "Rendez_vous", "Rendez-vous"],
      itemStart: ["Heure", "Horaire", "Debut", "Début", "Heure_debut", "Heure début", "Horaire_debut", "Horaire début"],
      itemEnd: ["Fin", "Heure_fin", "Heure fin", "Horaire_fin", "Horaire fin"],
      itemVisual: ["Visuel", "Pictogramme", "Picto", "Image", "Photo", "Illustration", "Icone", "Icône"],
      itemPeople: ["Animateurs", "Animateur", "Professionnels", "Professionnel", "Intervenants", "Intervenant", "Reeducateur", "Rééducateur", "Kine", "Kiné", "Orthophoniste"],
      itemPlace: ["Lieu", "Salle", "Localisation", "Endroit"]
    }
  };

  const DAYS = [
    {key: "lundi", label: "Lundi", color: CONFIG.colors.lundi, index: 1},
    {key: "mardi", label: "Mardi", color: CONFIG.colors.mardi, index: 2},
    {key: "mercredi", label: "Mercredi", color: CONFIG.colors.mercredi, index: 3},
    {key: "jeudi", label: "Jeudi", color: CONFIG.colors.jeudi, index: 4},
    {key: "vendredi", label: "Vendredi", color: CONFIG.colors.vendredi, index: 5}
  ];

  const state = {
    tables: new Map(),
    schemas: new Map(),
    tableRefToId: new Map(),
    userRows: [],
    participationRows: [],
    usersTableId: CONFIG.tables.users,
    participationsTableId: CONFIG.tables.participations,
    yearSource: null,
    selectedUserId: null,
    selectedYearKey: null,
    tokenInfo: null
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
      state.selectedUserId = Number(els.userSelect.value);
      await renderSelectedPlanning();
    });

    els.yearSelect.addEventListener("change", async () => {
      state.selectedYearKey = els.yearSelect.value;
      await renderSelectedPlanning();
    });

    els.printButton.addEventListener("click", () => {
      prepareAndPrint();
    });

    window.addEventListener("beforeprint", fitPrintContent);
    window.addEventListener("afterprint", resetPrintFit);
  }

  function initializeGrist() {
    if (!window.grist) {
      fatal("L’API Grist n’est pas disponible. Ouvrez cette page comme widget personnalisé dans Grist.");
      return;
    }

    grist.ready({requiredAccess: "full"});

    /* onRecords sert de signal de rafraîchissement quand la table liée au widget
       est modifiée. On relit alors les tables utiles pour garder l'affichage à jour. */
    grist.onRecords(() => {
      refreshAll().catch(handleError);
    });

    /* Sécurité : certains contextes déclenchent tardivement onRecords. */
    setTimeout(() => refreshAll().catch(handleError), 250);
  }

  async function refreshAll() {
    setStatus("Chargement des données…");

    await loadMetadata();

    const tables = await grist.docApi.listTables();
    state.usersTableId = findTableId(tables, CONFIG.tables.users);
    state.participationsTableId = findTableId(tables, CONFIG.tables.participations);

    if (!state.usersTableId) {
      throw new Error(`Table "${CONFIG.tables.users}" introuvable.`);
    }
    if (!state.participationsTableId) {
      throw new Error(`Table "${CONFIG.tables.participations}" introuvable.`);
    }

    state.tables.clear();
    state.userRows = await getRows(state.usersTableId, true);
    state.participationRows = await getRows(state.participationsTableId, true);
    state.tokenInfo = await grist.docApi.getAccessToken({readOnly: true});

    state.yearSource = await discoverYearSource(tables);

    populateUserSelect();
    populateYearSelect();

    els.userSelect.disabled = state.userRows.length === 0;
    els.yearSelect.disabled = !state.yearSource || state.yearSource.options.length === 0;
    els.printButton.disabled = !state.selectedUserId;

    await renderSelectedPlanning();

    setStatus("Planning à jour.");
  }

  async function loadMetadata() {
    const [tablesData, columnsData] = await Promise.all([
      grist.docApi.fetchTable("_grist_Tables"),
      grist.docApi.fetchTable("_grist_Tables_column")
    ]);

    const tableRows = columnarToRows(tablesData);
    const columnRows = columnarToRows(columnsData);

    state.tableRefToId.clear();
    state.schemas.clear();

    for (const t of tableRows) {
      if (t.id != null && t.tableId) {
        state.tableRefToId.set(Number(t.id), String(t.tableId));
      }
    }

    for (const c of columnRows) {
      const tableId = state.tableRefToId.get(Number(c.parentId));
      if (!tableId || !c.colId) continue;
      if (!state.schemas.has(tableId)) state.schemas.set(tableId, new Map());
      state.schemas.get(tableId).set(String(c.colId), {
        type: String(c.type || ""),
        label: String(c.label || c.colId),
        id: c.id
      });
    }
  }

  function findTableId(tables, wanted) {
    const nw = norm(wanted);
    return tables.find(t => norm(t) === nw) || null;
  }

  async function getRows(tableId, force = false) {
    if (!force && state.tables.has(tableId)) return state.tables.get(tableId);
    const data = await grist.docApi.fetchTable(tableId);
    const rows = columnarToRows(data);
    state.tables.set(tableId, rows);
    return rows;
  }

  function columnarToRows(data) {
    if (!data || typeof data !== "object") return [];
    const ids = Array.isArray(data.id) ? data.id : [];
    return ids.map((id, i) => {
      const row = {id};
      for (const [key, values] of Object.entries(data)) {
        if (!Array.isArray(values)) continue;
        row[key] = safeDecode(values[i]);
      }
      return row;
    });
  }

  function safeDecode(value) {
    try {
      return typeof grist.decodeObject === "function" ? grist.decodeObject(value) : value;
    } catch {
      if (Array.isArray(value) && value[0] === "L") return value.slice(1);
      return value;
    }
  }

  async function discoverYearSource(allTables) {
    const schemaCandidates = [];

    for (const tableId of allTables) {
      const schema = state.schemas.get(tableId);
      if (!schema) continue;
      const stateCol = findColumnInSchema(tableId, CONFIG.columns.yearState);
      if (stateCol) schemaCandidates.push(tableId);
    }

    const priority = ["Annees", "Années", "Annees_scolaires", "Années scolaires", "Parametres", "Paramètres"];
    schemaCandidates.sort((a, b) => {
      const ia = priority.findIndex(x => norm(x) === norm(a));
      const ib = priority.findIndex(x => norm(x) === norm(b));
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });

    for (const tableId of schemaCandidates) {
      const rows = await getRows(tableId);
      if (!rows.length) continue;

      const stateKey = pickKey(rows[0], CONFIG.columns.yearState);
      if (!stateKey) continue;

      const current = rows.find(r => norm(r[stateKey]) === "actuel");
      if (!current) continue;

      const labelKey =
        pickKey(rows[0], CONFIG.columns.yearLabel) ||
        firstUsefulTextColumn(tableId, rows[0], [stateKey]);

      if (!labelKey) continue;

      const options = rows
        .filter(r => r[labelKey] != null && String(r[labelKey]).trim() !== "")
        .map(r => ({
          id: Number(r.id),
          key: `${tableId}:${r.id}`,
          label: String(r[labelKey]),
          tableId,
          row: r,
          isCurrent: Number(r.id) === Number(current.id)
        }));

      return {
        tableId,
        labelKey,
        stateKey,
        currentId: Number(current.id),
        options
      };
    }

    /* Repli : si aucune table "Etat = Actuel" n'est trouvée, on extrait
       les années directement depuis Participations. */
    const yearCol = findParticipationYearColumn();
    if (!yearCol) return null;

    const values = [];
    const seen = new Set();
    for (const p of state.participationRows) {
      const v = p[yearCol];
      for (const item of toArray(v)) {
        const key = String(item);
        if (!seen.has(key) && key !== "" && key !== "0") {
          seen.add(key);
          values.push(item);
        }
      }
    }

    values.sort((a, b) => String(a).localeCompare(String(b), "fr", {numeric: true}));

    return {
      tableId: null,
      labelKey: null,
      stateKey: null,
      currentId: null,
      fallback: true,
      options: values.map(v => ({
        id: null,
        key: `fallback:${String(v)}`,
        label: String(v),
        rawValue: v,
        isCurrent: false
      }))
    };
  }

  function populateUserSelect() {
    const previous = state.selectedUserId;

    const activeUsers = state.userRows
      .filter(r => {
        const leftKey = pickKey(r, CONFIG.columns.userLeft);
        /* "Parti_e = False" : on garde uniquement les lignes non parties.
           Une cellule vide est considérée comme False, comme dans Grist. */
        return !leftKey || isFalseLike(r[leftKey]);
      })
      .map(r => ({
        id: Number(r.id),
        label: userLabel(r),
        lastName: userLastName(r),
        firstName: userFirstName(r)
      }))
      .sort((a, b) =>
        a.lastName.localeCompare(b.lastName, "fr", {sensitivity: "base"}) ||
        a.firstName.localeCompare(b.firstName, "fr", {sensitivity: "base"}) ||
        a.label.localeCompare(b.label, "fr", {sensitivity: "base"})
      );

    els.userSelect.innerHTML = "";

    if (!activeUsers.length) {
      addOption(els.userSelect, "", "Aucun usager actif");
      state.selectedUserId = null;
      return;
    }

    for (const u of activeUsers) addOption(els.userSelect, String(u.id), u.label);

    const stillExists = activeUsers.some(u => u.id === previous);
    state.selectedUserId = stillExists ? previous : activeUsers[0].id;
    els.userSelect.value = String(state.selectedUserId);
  }

  function populateYearSelect() {
    const previous = state.selectedYearKey;
    els.yearSelect.innerHTML = "";

    if (!state.yearSource || !state.yearSource.options.length) {
      addOption(els.yearSelect, "", "Année introuvable");
      state.selectedYearKey = null;
      return;
    }

    for (const y of state.yearSource.options) {
      addOption(els.yearSelect, y.key, y.label);
    }

    const previousExists = state.yearSource.options.some(y => y.key === previous);
    if (previousExists) {
      state.selectedYearKey = previous;
    } else {
      const current = state.yearSource.options.find(y => y.isCurrent);
      state.selectedYearKey = (current || state.yearSource.options[0]).key;
    }

    els.yearSelect.value = state.selectedYearKey;
  }

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  async function renderSelectedPlanning() {
    clearFatal();

    if (!state.selectedUserId) {
      els.userFullName.textContent = "Sélectionnez une personne";
      els.planningTitle.textContent = "Planning";
      clearAllActivities();
      return;
    }

    const user = state.userRows.find(r => Number(r.id) === Number(state.selectedUserId));
    if (!user) return;

    const year = selectedYearOption();
    const yearLabel = year?.label || "";
    els.planningTitle.textContent = `Planning${yearLabel ? " " + yearLabel : ""}`;
    els.userFullName.textContent = userLabel(user);
    await renderPortrait(user);

    const participationUserCol = findParticipationUserColumn();
    if (!participationUserCol) {
      throw new Error(
        `Impossible d’identifier, dans "${state.participationsTableId}", la colonne qui référence la table "${state.usersTableId}".`
      );
    }

    const filtered = state.participationRows.filter(p => {
      const matchesUser = valueMatchesRow(
        p[participationUserCol],
        state.selectedUserId,
        userLabel(user)
      );
      return matchesUser && participationMatchesYear(p, year);
    });

    const models = await Promise.all(filtered.map(p => participationToModel(p)));

    const visibleModels = models.filter(m => DAYS.some(d => d.key === m.day));
    const buckets = new Map();
    for (const d of DAYS) {
      buckets.set(`${d.key}:matin`, []);
      buckets.set(`${d.key}:apres-midi`, []);
    }

    for (const m of visibleModels) {
      const key = `${m.day}:${m.half}`;
      if (buckets.has(key)) buckets.get(key).push(m);
    }

    for (const items of buckets.values()) {
      items.sort((a, b) => a.sortTime - b.sortTime || a.title.localeCompare(b.title, "fr"));
    }

    renderBuckets(buckets);
    applyDensity(buckets);

    const count = Array.from(buckets.values()).reduce((n, arr) => n + arr.length, 0);
    els.emptyState.hidden = count !== 0;
    els.weekGrid.hidden = false;
    els.printButton.disabled = false;

    setStatus(`${count} participation${count > 1 ? "s" : ""} affichée${count > 1 ? "s" : ""}.`);
  }

  function selectedYearOption() {
    return state.yearSource?.options.find(y => y.key === state.selectedYearKey) || null;
  }

  function participationMatchesYear(p, year) {
    if (!year) return true;
    const yearCol = findParticipationYearColumn();
    if (!yearCol) return true;

    const value = p[yearCol];

    /* Si la colonne est une référence vers la table d'années, comparaison par id. */
    const refTable = refTarget(state.participationsTableId, yearCol);
    if (year.tableId && refTable && norm(refTable) === norm(year.tableId) && year.id != null) {
      return valueMatchesRow(value, year.id, year.label);
    }

    if (year.rawValue !== undefined) {
      return toArray(value).some(v => String(v) === String(year.rawValue));
    }

    return toArray(value).some(v =>
      norm(v) === norm(year.label) ||
      (year.id != null && Number(v) === Number(year.id))
    );
  }

  async function participationToModel(p) {
    const sourceRows = await resolveActivitySources(p);
    const sources = [p, ...sourceRows];

    const title = await firstDisplayValue(sources, CONFIG.columns.itemName) || "Activité";
    const startRaw = firstRawValue(sources, CONFIG.columns.itemStart);
    const endRaw = firstRawValue(sources, CONFIG.columns.itemEnd);
    const start = formatTime(startRaw);
    const end = formatTime(endRaw);
    const timeText = start && end && start !== end ? `${start} – ${end}` : (start || end || "");

    const people = await firstDisplayValue(sources, CONFIG.columns.itemPeople);
    const place = await firstDisplayValue(sources, CONFIG.columns.itemPlace);
    const visual = await firstVisualUrl(sources);

    const day = resolveDay(p, sources);
    const half = resolveHalfDay(p, startRaw);

    return {
      id: p.id,
      title,
      timeText,
      people,
      place,
      visual,
      day,
      half,
      sortTime: timeToMinutes(startRaw)
    };
  }

  async function resolveActivitySources(p) {
    const result = [];
    const keys = matchingKeys(p, CONFIG.columns.activityRef);

    for (const key of keys) {
      const value = p[key];
      if (isEmptyValue(value)) continue;

      const target = refTarget(state.participationsTableId, key);
      if (target) {
        const rows = await getRows(target);
        for (const id of numericIds(value)) {
          const row = rows.find(r => Number(r.id) === Number(id));
          if (row) {
            Object.defineProperty(row, "__tableId", {value: target, enumerable: false, configurable: true});
            result.push(row);
          }
        }
      }
    }

    return result;
  }

  function resolveDay(p, sources) {
    const dayKey = pickKey(p, CONFIG.columns.participantDay);
    if (dayKey && !isEmptyValue(p[dayKey])) {
      const n = norm(p[dayKey]);
      const day = DAYS.find(d => n.includes(d.key));
      if (day) return day.key;

      const asNumber = Number(p[dayKey]);
      if (Number.isFinite(asNumber)) {
        const numbered = DAYS.find(d => d.index === asNumber);
        if (numbered) return numbered.key;
      }
    }

    const dateKey = pickKey(p, CONFIG.columns.participantDate);
    if (dateKey && p[dateKey] != null) {
      const date = toDate(p[dateKey]);
      if (date && !Number.isNaN(date.getTime())) {
        const jsDay = date.getDay(); // 1=lundi ... 5=vendredi
        const day = DAYS.find(d => d.index === jsDay);
        if (day) return day.key;
      }
    }

    /* Dernier repli : certains modèles mettent le jour dans l'activité référencée. */
    for (const src of sources.slice(1)) {
      const k = pickKey(src, CONFIG.columns.participantDay);
      if (!k) continue;
      const n = norm(src[k]);
      const day = DAYS.find(d => n.includes(d.key));
      if (day) return day.key;
    }

    return "";
  }

  function resolveHalfDay(p, startRaw) {
    const halfKey = pickKey(p, CONFIG.columns.participantHalf);
    if (halfKey && !isEmptyValue(p[halfKey])) {
      const n = norm(p[halfKey]);
      if (n.includes("matin") || n.includes("am")) return "matin";
      if (n.includes("apres") || n.includes("aprem") || n.includes("pm")) return "apres-midi";
    }

    const minutes = timeToMinutes(startRaw);
    /* 12 h 30 permet de classer correctement une activité débutant à midi. */
    return Number.isFinite(minutes) && minutes < 12 * 60 + 30 ? "matin" : "apres-midi";
  }

  function renderBuckets(buckets) {
    for (const d of DAYS) {
      for (const half of ["matin", "apres-midi"]) {
        const list = document.querySelector(`[data-list="${d.key}:${half}"]`);
        list.innerHTML = "";
        const items = buckets.get(`${d.key}:${half}`) || [];

        if (!items.length) {
          const empty = document.createElement("div");
          empty.className = "empty-half";
          empty.textContent = "Aucune activité";
          list.appendChild(empty);
          continue;
        }

        for (const item of items) {
          list.appendChild(activityCard(item, d.color));
        }
      }
    }
  }

  function activityCard(item, dayColor) {
    const card = document.createElement("article");
    card.className = `activity-card${item.visual ? "" : " no-visual"}`;
    card.style.setProperty("--day-color", dayColor);

    if (item.visual) {
      const img = document.createElement("img");
      img.className = "activity-visual";
      img.src = item.visual;
      img.alt = "";
      img.loading = "eager";
      img.addEventListener("error", () => {
        img.remove();
        card.classList.add("no-visual");
      }, {once: true});
      card.appendChild(img);
    }

    const body = document.createElement("div");

    const title = document.createElement("div");
    title.className = "activity-title";
    title.textContent = item.title;
    body.appendChild(title);

    if (item.timeText) {
      const time = document.createElement("div");
      time.className = "activity-time";
      time.textContent = item.timeText;
      body.appendChild(time);
    }

    if (item.people) {
      body.appendChild(metaLine("Avec", item.people));
    }

    if (item.place) {
      body.appendChild(metaLine("Lieu", item.place));
    }

    card.appendChild(body);
    return card;
  }

  function metaLine(label, value) {
    const el = document.createElement("div");
    el.className = "activity-meta";

    const strong = document.createElement("strong");
    strong.textContent = `${label} : `;
    el.appendChild(strong);
    el.appendChild(document.createTextNode(String(value)));
    return el;
  }

  function buildWeekSkeleton() {
    els.weekGrid.innerHTML = "";

    for (const day of DAYS) {
      const col = document.createElement("section");
      col.className = "day-column";

      const header = document.createElement("div");
      header.className = "day-header";
      header.style.backgroundColor = day.color;
      header.textContent = day.label;
      col.appendChild(header);

      col.appendChild(halfDayBlock(day, "matin", "Matin"));
      col.appendChild(halfDayBlock(day, "apres-midi", "Après-midi"));

      els.weekGrid.appendChild(col);
    }
  }

  function halfDayBlock(day, key, label) {
    const block = document.createElement("div");
    block.className = "half-day";

    const heading = document.createElement("div");
    heading.className = "half-label";
    heading.textContent = label;

    const list = document.createElement("div");
    list.className = "activity-list";
    list.dataset.list = `${day.key}:${key}`;

    block.appendChild(heading);
    block.appendChild(list);
    return block;
  }

  function clearAllActivities() {
    document.querySelectorAll(".activity-list").forEach(el => el.innerHTML = "");
  }

  async function renderPortrait(user) {
    const key = pickKey(user, CONFIG.columns.userPortrait);
    els.portrait.hidden = true;
    els.portrait.removeAttribute("src");
    els.portraitFallback.hidden = false;
    els.portraitFallback.textContent = initials(userLabel(user)) || "?";

    if (!key || isEmptyValue(user[key])) return;

    const url = await visualValueToUrl(state.usersTableId, key, user[key]);
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

  async function firstVisualUrl(sources) {
    for (const src of sources) {
      const tableId = src === sources[0]
        ? state.participationsTableId
        : (src.__tableId || "");
      const keys = matchingKeys(src, CONFIG.columns.itemVisual);

      for (const key of keys) {
        if (isEmptyValue(src[key])) continue;
        const url = await visualValueToUrl(tableId, key, src[key]);
        if (url) return url;
      }
    }
    return "";
  }

  async function visualValueToUrl(tableId, colKey, value, depth = 0) {
    if (depth > 3 || isEmptyValue(value)) return "";

    if (typeof value === "string") {
      const s = value.trim();
      if (/^(https?:|data:|blob:)/i.test(s)) return s;
    }

    const meta = state.schemas.get(tableId)?.get(colKey);
    const type = meta?.type || "";

    if (type === "Attachments" || norm(colKey).includes("photo") || norm(colKey).includes("visuel") || norm(colKey).includes("image") || norm(colKey).includes("picto")) {
      const ids = numericIds(value);
      if (ids.length && state.tokenInfo) {
        return `${state.tokenInfo.baseUrl}/attachments/${ids[0]}/download?auth=${encodeURIComponent(state.tokenInfo.token)}`;
      }
    }

    const target = refTarget(tableId, colKey);
    if (target) {
      const rows = await getRows(target);
      for (const id of numericIds(value)) {
        const row = rows.find(r => Number(r.id) === Number(id));
        if (!row) continue;
        for (const key of matchingKeys(row, CONFIG.columns.itemVisual)) {
          const url = await visualValueToUrl(target, key, row[key], depth + 1);
          if (url) return url;
        }
      }
    }

    return "";
  }

  async function firstDisplayValue(sources, candidates) {
    for (const src of sources) {
      const tableId = src === sources[0]
        ? state.participationsTableId
        : (src.__tableId || "");
      const keys = matchingKeys(src, candidates);

      for (const key of keys) {
        if (isEmptyValue(src[key])) continue;
        const value = await displayValue(tableId, key, src[key]);
        if (value) return value;
      }
    }
    return "";
  }

  function firstRawValue(sources, candidates) {
    for (const src of sources) {
      const key = pickKey(src, candidates);
      if (key && !isEmptyValue(src[key])) return src[key];
    }
    return null;
  }

  async function displayValue(tableId, colKey, value) {
    const target = refTarget(tableId, colKey);
    if (target) {
      const rows = await getRows(target);
      const labels = [];
      for (const id of numericIds(value)) {
        const row = rows.find(r => Number(r.id) === Number(id));
        if (row) labels.push(genericRowLabel(row));
      }
      if (labels.length) return labels.join(", ");
    }

    if (Array.isArray(value)) {
      return value
        .filter(v => v !== "L" && v != null && v !== "")
        .map(v => String(v))
        .join(", ");
    }

    return String(value ?? "").trim();
  }

  function genericRowLabel(row) {
    const first = userFirstName(row);
    const last = userLastName(row);
    if (first || last) return `${first} ${last}`.trim();

    const candidates = [
      "Usager", "Nom_complet", "Nom complet",
      "Nom", "Titre", "Libelle", "Libellé",
      "Activite", "Activité", "Professionnel",
      "Intervenant", "Lieu", "Salle"
    ];
    const key = pickKey(row, candidates);
    if (key && !isEmptyValue(row[key])) return String(row[key]);

    return `#${row.id}`;
  }

  function userLabel(row) {
    const displayKey = pickKey(row, CONFIG.columns.userDisplay);
    if (displayKey && !isEmptyValue(row[displayKey])) {
      return String(row[displayKey]).trim();
    }
    const first = userFirstName(row);
    const last = userLastName(row);
    return `${first} ${last}`.trim() || `Usager #${row.id}`;
  }

  function userLastName(row) {
    const key = pickKey(row, CONFIG.columns.userLastName);
    if (key && !isEmptyValue(row[key])) return String(row[key]).trim();

    /* Si seul "Usager" existe, on utilise le dernier mot comme repli de tri.
       Le vrai champ Nom reste toujours prioritaire. */
    const label = userLabelNoRecursion(row);
    const parts = label.trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : label;
  }

  function userFirstName(row) {
    const key = pickKey(row, CONFIG.columns.userFirstName);
    return key && !isEmptyValue(row[key]) ? String(row[key]).trim() : "";
  }

  function userLabelNoRecursion(row) {
    const displayKey = pickKey(row, CONFIG.columns.userDisplay);
    if (displayKey && !isEmptyValue(row[displayKey])) return String(row[displayKey]).trim();
    return String(row.id ?? "");
  }

  function findParticipationUserColumn() {
    const schema = state.schemas.get(state.participationsTableId);
    if (schema) {
      for (const [colId, meta] of schema.entries()) {
        const target = refTargetFromType(meta.type);
        if (target && norm(target) === norm(state.usersTableId)) return colId;
      }
    }
    return state.participationRows.length
      ? pickKey(state.participationRows[0], CONFIG.columns.participantUser)
      : null;
  }

  function findParticipationYearColumn() {
    if (state.yearSource?.tableId) {
      const schema = state.schemas.get(state.participationsTableId);
      if (schema) {
        for (const [colId, meta] of schema.entries()) {
          const target = refTargetFromType(meta.type);
          if (target && norm(target) === norm(state.yearSource.tableId)) return colId;
        }
      }
    }

    return state.participationRows.length
      ? pickKey(state.participationRows[0], CONFIG.columns.participantYear)
      : findColumnInSchema(state.participationsTableId, CONFIG.columns.participantYear);
  }

  function refTarget(tableId, colId) {
    const type = state.schemas.get(tableId)?.get(colId)?.type;
    return refTargetFromType(type);
  }

  function refTargetFromType(type) {
    if (!type) return null;
    const m = String(type).match(/^(?:Ref|RefList|ReferenceList):(.+)$/);
    return m ? m[1] : null;
  }

  function findColumnInSchema(tableId, candidates) {
    const schema = state.schemas.get(tableId);
    if (!schema) return null;
    const byNorm = new Map(Array.from(schema.keys()).map(k => [norm(k), k]));
    for (const c of candidates) {
      const hit = byNorm.get(norm(c));
      if (hit) return hit;
    }
    return null;
  }

  function firstUsefulTextColumn(tableId, row, excluded = []) {
    const schema = state.schemas.get(tableId);
    const excludedNorm = new Set(excluded.map(norm));

    for (const [colId, meta] of (schema || new Map()).entries()) {
      if (excludedNorm.has(norm(colId))) continue;
      if (!["Text", "Choice", "Any"].includes(meta.type)) continue;
      if (!isEmptyValue(row[colId])) return colId;
    }

    for (const key of Object.keys(row)) {
      if (key === "id" || excludedNorm.has(norm(key))) continue;
      if (typeof row[key] === "string" && row[key].trim()) return key;
    }
    return null;
  }

  function pickKey(row, candidates) {
    if (!row) return null;
    const map = new Map(Object.keys(row).map(k => [norm(k), k]));
    for (const c of candidates) {
      const hit = map.get(norm(c));
      if (hit) return hit;
    }
    return null;
  }

  function matchingKeys(row, candidates) {
    if (!row) return [];
    const map = new Map(Object.keys(row).map(k => [norm(k), k]));
    const result = [];
    for (const c of candidates) {
      const hit = map.get(norm(c));
      if (hit && !result.includes(hit)) result.push(hit);
    }
    return result;
  }

  function norm(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  function isFalseLike(value) {
    return value === false ||
      value === 0 ||
      value == null ||
      value === "" ||
      norm(value) === "false" ||
      norm(value) === "faux" ||
      norm(value) === "non";
  }

  function isEmptyValue(value) {
    return value == null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0) ||
      (Array.isArray(value) && value.length === 1 && value[0] === "L");
  }

  function toArray(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value[0] === "L" ? value.slice(1) : value;
    return [value];
  }

  function numericIds(value) {
    return toArray(value)
      .map(v => Number(v))
      .filter(v => Number.isFinite(v) && v > 0);
  }

  function valueMatchesRow(value, rowId, displayLabel) {
    const values = toArray(value);
    return values.some(v =>
      Number(v) === Number(rowId) ||
      norm(v) === norm(displayLabel)
    );
  }

  function formatTime(value) {
    if (value == null || value === "") return "";

    if (typeof value === "string") {
      const s = value.trim();
      const m = s.match(/\b(\d{1,2})[h:](\d{2})\b/i);
      if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
      const h = s.match(/^\d{1,2}$/);
      if (h) return `${h[0].padStart(2, "0")}:00`;
      return s;
    }

    if (typeof value === "number") {
      /* Time of day Grist : nombre de secondes depuis minuit. */
      if (value >= 0 && value < 86400) {
        const h = Math.floor(value / 3600);
        const m = Math.floor((value % 3600) / 60);
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      }

      /* DateTime Grist : timestamp en secondes. */
      if (value > 1e8) {
        const d = new Date(value * 1000);
        if (!Number.isNaN(d.getTime())) {
          return d.toLocaleTimeString("fr-FR", {hour: "2-digit", minute: "2-digit"});
        }
      }
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toLocaleTimeString("fr-FR", {hour: "2-digit", minute: "2-digit"});
    }

    return String(value);
  }

  function timeToMinutes(value) {
    if (value == null || value === "") return 99999;

    if (typeof value === "number") {
      if (value >= 0 && value < 86400) return value / 60;
      if (value > 1e8) {
        const d = new Date(value * 1000);
        return d.getHours() * 60 + d.getMinutes();
      }
    }

    if (value instanceof Date) return value.getHours() * 60 + value.getMinutes();

    const s = String(value);
    const m = s.match(/(\d{1,2})\s*[h:]\s*(\d{2})/i);
    if (m) return Number(m[1]) * 60 + Number(m[2]);

    const h = s.match(/^\s*(\d{1,2})\s*$/);
    if (h) return Number(h[1]) * 60;

    return 99999;
  }

  function toDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === "number") {
      const ms = value < 1e12 ? value * 1000 : value;
      return new Date(ms);
    }
    return new Date(value);
  }

  function initials(name) {
    return String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(x => x[0]?.toUpperCase() || "")
      .join("");
  }

  function applyDensity(buckets) {
    els.printInner.classList.remove("density-compact", "density-ultra");
    const counts = Array.from(buckets.values()).map(a => a.length);
    const maxHalf = Math.max(0, ...counts);
    const total = counts.reduce((a, b) => a + b, 0);

    if (maxHalf >= 5 || total >= 24) {
      els.printInner.classList.add("density-ultra");
    } else if (maxHalf >= 4 || total >= 18) {
      els.printInner.classList.add("density-compact");
    }
  }

  async function prepareAndPrint() {
    setStatus("Préparation de l’impression A4…");

    /* On laisse aux images déjà demandées une micro-tâche pour finir leur rendu. */
    await new Promise(resolve => setTimeout(resolve, 80));
    fitPrintContent();
    window.print();
  }

  function fitPrintContent() {
    resetPrintFit();

    /* En impression, le viewport fait 287 x 200 mm. On convertit ces dimensions
       en pixels CSS (96 dpi) pour calculer un facteur d'échelle fiable. */
    const pxPerMm = 96 / 25.4;
    const targetW = 287 * pxPerMm;
    const targetH = 200 * pxPerMm;

    const inner = els.printInner;
    const currentW = inner.scrollWidth || inner.getBoundingClientRect().width;
    const currentH = inner.scrollHeight || inner.getBoundingClientRect().height;

    if (!currentW || !currentH) return;

    const scale = Math.min(1, targetW / currentW, targetH / currentH);
    inner.style.transform = `scale(${scale})`;
  }

  function resetPrintFit() {
    if (els.printInner) els.printInner.style.transform = "";
  }

  function setStatus(message) {
    if (els.status) els.status.textContent = message;
  }

  function handleError(error) {
    console.error(error);
    fatal(error?.message || String(error));
  }

  function fatal(message) {
    if (!els.fatalError) return;
    els.fatalError.hidden = false;
    els.fatalError.textContent =
      `${message}\n\n` +
      `Vérifiez les noms de tables/colonnes ou adaptez le bloc CONFIG au début de script.js.`;
    setStatus("Erreur de configuration.");
  }

  function clearFatal() {
    if (els.fatalError) {
      els.fatalError.hidden = true;
      els.fatalError.textContent = "";
    }
  }
})();
