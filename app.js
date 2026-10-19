let allContests = [];
let allDrawings = [];

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

async function initApp() {
  try {
    const [contestsRes, drawingsRes] = await Promise.all([
      fetch("./data/contests.json"),
      fetch("./data/drawings.json")
    ]);

    if (!contestsRes.ok || !drawingsRes.ok) throw new Error("Erreur de chargement JSON");

    allContests = await contestsRes.json();
    allDrawings = await drawingsRes.json();

    // Tri des concours par date de début
    allContests.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

    // Gestion des clics de navigation
    document.getElementById("nav-home").addEventListener("click", (e) => { e.preventDefault(); renderHome(); });
    document.getElementById("nav-contests").addEventListener("click", (e) => { e.preventDefault(); renderContestsPage(); });
    document.getElementById("nav-artists").addEventListener("click", (e) => { e.preventDefault(); renderArtistsPage(); });

    // Afficher la page d'accueil par défaut
    renderHome();
    setupSearchLogic()

  } catch (err) {
    console.error(err);
    document.getElementById("main-content").innerHTML = `<p class="error">Erreur lors de la récupération des données.</p>`;
  }
}

// Helper pour mettre la classe 'active' sur le menu
function setActiveNav(navId) {
  document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
  if (navId) document.getElementById(navId)?.classList.add("active");
}

/* ==========================================================================
   1. PAGE ACCUEIL : CONCOURS & LEURS DESSINS (RANGÉS PAR LIGNES DE 5)
   ========================================================================== */
function renderHome() {
  setActiveNav("nav-home");
  const main = document.getElementById("main-content");
  main.innerHTML = "";

  // 1. Afficher le/les vainqueur(s) du dernier concours terminé en date
  const lastContestWithWinners = getLastFinishedContestWithWinners();
  if (lastContestWithWinners) {
    // MODIFICATION ICI : On passe 'true' pour indiquer que c'est le DERNIER concours
    const winnerBanner = createWinnersBanner(lastContestWithWinners, true);
    if (winnerBanner) {
      // Le titre redondant a été enlevé ici comme demandé
      main.appendChild(winnerBanner);
    }
  }

  // 2. Affichage standard des concours
  allContests.forEach((contest, index) => {
    const startDate = formatDate(new Date(contest.start_date));
    let endDate = "En cours";
    if (index > 0) {
      endDate = formatDate(new Date(allContests[index - 1].start_date));
    } else if (contest.end_date) {
      endDate = formatDate(new Date(contest.end_date));
    }

    const contestDrawings = allDrawings.filter(d => d.contest_id === contest.id);

    const section = document.createElement("section");
    section.innerHTML = `
      <h2 class="contest-title-header">${escapeHtml(contest.title)}</h2>
      <p class="contest-dates">Du ${startDate} au ${endDate}</p>
      <div class="grid-5" id="grid-${contest.id}"></div>
    `;
    main.appendChild(section);

    const grid = section.querySelector(`#grid-${contest.id}`);
    contestDrawings.forEach(drawing => {
      grid.appendChild(createDrawingCard(drawing));
    });
  });

  // Section Hors Concours
  const orphanDrawings = allDrawings.filter(d => d.contest_id === "hors_concours");
  if (orphanDrawings.length > 0) {
    const orphanSection = document.createElement("section");
    orphanSection.innerHTML = `
      <h2 class="contest-title-header">Hors Concours</h2>
      <div class="grid-5" id="grid-hors-concours"></div>
    `;
    main.appendChild(orphanSection);

    const orphanGrid = orphanSection.querySelector("#grid-hors-concours");
    orphanDrawings.forEach(drawing => orphanGrid.appendChild(createDrawingCard(drawing)));
  }
}

/* ==========================================================================
   2. PAGE ARTISTES : PHOTOS DE PROFIL RONDES (PFP) EN GRILLE DE 5
   ========================================================================== */
function renderArtistsPage() {
  setActiveNav("nav-artists");
  const main = document.getElementById("main-content");
  main.innerHTML = `<h2 class="contest-title-header">Liste des Artistes</h2><div class="grid-5" id="artists-grid"></div>`;

  const grid = document.getElementById("artists-grid");

  // Extraire la liste unique des artistes avec leur photo (champ pfp)
  const artistsMap = new Map();
  allDrawings.forEach(d => {
    if (!artistsMap.has(d.author_display_name)) {
      artistsMap.set(d.author_display_name, d.pfp || "broken_pfp_link.png");
    }
  });

  artistsMap.forEach((pfpUrl, artistName) => {
    if(artistName!=""){
      const card = document.createElement("div");
      card.classList.add("artist-card");
      card.innerHTML = `
        <img src="${escapeHtml(pfpUrl)}" alt="${escapeHtml(artistName)}" class="artist-pfp" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><circle cx=\'50\' cy=\'50\' r=\'45\' fill=\'%23ccc\'/><text x=\'50%\' y=\'55%\' font-size=\'12\' text-anchor=\'middle\' fill=\'%23666\'>Photo</text></svg>'">
        <div class="artist-name">${escapeHtml(artistName)}</div>
      `;
      card.addEventListener("click", () => renderArtistFiltered(artistName));
      grid.appendChild(card);
    }
  });
}

/* ==========================================================================
   3. PAGE CONCOURS : VIGNETTES DES CONCOURS (IMAGE) EN GRILLE DE 5
   ========================================================================== */
function renderContestsPage() {
  setActiveNav("nav-contests");
  const main = document.getElementById("main-content");
  main.innerHTML = `<h2 class="contest-title-header">Tous les Concours</h2><div class="grid-5" id="contests-grid"></div>`;

  const grid = document.getElementById("contests-grid");

  allContests.forEach(contest => {
    const card = document.createElement("div");
    card.classList.add("contest-card");
    
    // Requête vers le champ `image` dans contests.json
    const contestImgUrl = contest.image || "broken_contest_image.png";

    card.innerHTML = `
      <img src="${escapeHtml(contestImgUrl)}" alt="${escapeHtml(contest.title)}" class="contest-card-img" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'150\'><rect width=\'100%\' height=\'100%\' fill=\'%23eee\'/><text x=\'50%\' y=\'50%\' font-size=\'14\' text-anchor=\'middle\' fill=\'%23999\'>Image Concours</text></svg>'">
      <div class="contest-card-title">${escapeHtml(contest.title)}</div>
    `;
    card.addEventListener("click", () => renderContestFiltered(contest.id, contest.title));
    grid.appendChild(card);
  });
}

/* ==========================================================================
   4. VUE FILTRÉE : DESSINS D'UN ARTISTE PRÉCIS
   ========================================================================== */
function renderArtistFiltered(artistName) {
  setActiveNav("nav-artists");
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <h2 class="contest-title-header">Dessins de : ${escapeHtml(artistName)}</h2>
    <div class="grid-5" id="filtered-grid"></div>
  `;

  const grid = document.getElementById("filtered-grid");
  const artistDrawings = allDrawings.filter(d => d.author_display_name === artistName);

  artistDrawings.forEach(drawing => {
    grid.appendChild(createDrawingCard(drawing));
  });
}

/* ==========================================================================
   5. VUE FILTRÉE : DESSINS D'UN CONCOURS PRÉCIS
   ========================================================================== */
function renderContestFiltered(contestId, contestTitle) {
  setActiveNav("nav-contests");
  const main = document.getElementById("main-content");
  main.innerHTML = "";

  const contest = allContests.find(c => c.id === contestId);

  // Titre du concours
  const titleHeader = document.createElement("h2");
  titleHeader.classList.add("contest-title-header");
  titleHeader.textContent = `Concours : ${contestTitle}`;
  main.appendChild(titleHeader);

  // Bannière des vainqueurs si elle existe pour ce concours
  if (contest) {
    // MODIFICATION ICI : On ne passe pas le 2ème paramètre (il sera 'false' par défaut)
    const winnerBanner = createWinnersBanner(contest);
    if (winnerBanner) {
      main.appendChild(winnerBanner);
    }
  }

  // Grille de tous les dessins du concours
  const gridSection = document.createElement("div");
  gridSection.classList.add("grid-5");
  gridSection.id = "filtered-grid";
  main.appendChild(gridSection);

  const contestDrawings = allDrawings.filter(d => d.contest_id === contestId);
  contestDrawings.forEach(drawing => {
    gridSection.appendChild(createDrawingCard(drawing));
  });
}

/* ==========================================================================
   UTILITAIRES
   ========================================================================== */
function createDrawingCard(drawing) {
  const card = document.createElement("div");
  card.classList.add("drawing-card");
  card.innerHTML = `
    <div class="drawing-image-wrapper">
      <img src="${escapeHtml(drawing.local_path)}" alt="Dessin" loading="lazy" style="cursor: pointer;">
    </div>
    <div class="drawing-info">
      <p><span class="author-link" style="cursor: pointer;">${escapeHtml(drawing.author_display_name)}</span></p>
      <p class="date">${formatDate(new Date(drawing.created_at))}</p>
    </div>
  `;

  // Clic sur l'image -> Ouvre l'image en gros plan
  const imgElement = card.querySelector(".drawing-image-wrapper img");
  imgElement.addEventListener("click", () => {
    openLightbox(drawing.local_path, `Dessin de ${drawing.author_display_name}`);
  });

  return card;
}

function formatDate(date) {
  if (isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
/* ==========================================================================
   LIGHTBOX (AGRANDISSEMENT D'IMAGE SUR FOND NOIR)
   ========================================================================== */
function openLightbox(imageSrc, imageAlt = "Dessin") {
  let lightbox = document.getElementById("lightbox-modal");

  // Si la lightbox n'existe pas encore dans le DOM, on la crée
  if (!lightbox) {
    lightbox = document.createElement("div");
    lightbox.id = "lightbox-modal";
    lightbox.style.position = "fixed";
    lightbox.style.top = "0";
    lightbox.style.left = "0";
    lightbox.style.width = "100vw";
    lightbox.style.height = "100vh";
    lightbox.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
    lightbox.style.display = "flex";
    lightbox.style.justifyContent = "center";
    lightbox.style.alignItems = "center";
    lightbox.style.zIndex = "1000";
    lightbox.style.cursor = "pointer";

    const img = document.createElement("img");
    img.id = "lightbox-img";
    img.style.maxWidth = "90%";
    img.style.maxHeight = "90%";
    img.style.objectFit = "contain";
    img.style.borderRadius = "4px";
    img.style.boxShadow = "0 0 20px rgba(0,0,0,0.5)";

    lightbox.appendChild(img);

    // Clic n'importe où sur l'écran pour fermer
    lightbox.addEventListener("click", () => {
      lightbox.style.display = "none";
    });

    document.body.appendChild(lightbox);
  }

  // Mettre à jour l'image et afficher la lightbox
  const lightboxImg = document.getElementById("lightbox-img");
  lightboxImg.src = imageSrc;
  lightboxImg.alt = imageAlt;
  lightbox.style.display = "flex";
}

function setActiveNav(navId) {
  // Retire la classe 'active' de TOUS les liens de la navbar
  document.querySelectorAll(".navbar a").forEach(a => {
    a.classList.remove("active");
  });

  // Ajoute la classe 'active' uniquement sur l'onglet sélectionné s'il existe
  if (navId) {
    const activeLink = document.getElementById(navId);
    if (activeLink) {
      activeLink.classList.add("active");
    }
  }
}

/**
 * Génère le composant HTML des vainqueurs pour un concours donné
 * MODIFICATION : Ajout du paramètre isLatest (par défaut false)
 */
function createWinnersBanner(contest, isLatest = false) {
  if (!contest.winners || contest.winners.length === 0) return null;

  // Récupérer les objets "drawing" correspondants aux IDs renseignés dans contest.winners
  const winningDrawings = allDrawings.filter(d => contest.winners.includes(d.id));
  if (winningDrawings.length === 0) return null;

  const banner = document.createElement("div");
  banner.classList.add("winner-banner");

  if (isLatest) {
    banner.classList.add("home-winner-banner");
  }

  // MODIFICATION : Choix du texte en fonction du contexte
  let titleText;
  if (isLatest) {
    // Texte pour la page d'accueil (image 4)
    titleText = winningDrawings.length > 1 ? "🏆 Vainqueurs du dernier Concours 🏆" : "🏆 Vainqueur du dernier Concours 🏆";
  } else {
    // Texte pour la page du thème (image 5)
    titleText = winningDrawings.length > 1 ? "🏆 Vainqueurs du Concours 🏆" : "🏆 Vainqueur du Concours 🏆";
  }

  banner.innerHTML = `
    <h3>${titleText}</h3>
    <div class="winner-grid"></div>
  `;

  const grid = banner.querySelector(".winner-grid");
  winningDrawings.forEach(drawing => {
    const card = createDrawingCard(drawing);
    card.classList.add("winner-card");
    grid.appendChild(card);
  });

  return banner;
}

/**
 * Trouve le concours le plus récent qui possède au moins un vainqueur renseigné
 */
function getLastFinishedContestWithWinners() {
  // allContests étant déjà trié du plus récent au plus ancien, 
  // .find() va automatiquement nous retourner le premier concours ayant au moins 1 vainqueur.
  return allContests.find(c => Array.isArray(c.winners) && c.winners.length > 0);
}

// Tableau qui stocke les filtres actuellement validés (ex: [{ type: 'author', value: 'MaaLyx' }])
let selectedFilters = [];

// Écouteurs d'événements pour la recherche (à appeler dans initApp ou DOMContentLoaded)
function setupSearchLogic() {
  const input = document.getElementById("search-input");
  const suggestionsBox = document.getElementById("search-suggestions");
  const searchBtn = document.getElementById("search-btn");

  if (!input || !suggestionsBox) return;

  // 1. Détection de la saisie utilisateur
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();

    // Condition : au moins 2 caractères tapés
    if (query.length < 2) {
      suggestionsBox.style.display = "none";
      return;
    }

    const suggestions = getSearchSuggestions(query);
    renderSuggestions(suggestions);
  });

  // 2. Touche Entrée sur le champ de recherche
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      suggestionsBox.style.display = "none";
      performFilteredSearch();
    }
  });

  // 3. Clic sur le bouton Loupe
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      suggestionsBox.style.display = "none";
      performFilteredSearch();
    });
  }

  // Clic en dehors pour fermer les suggestions
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box-wrapper")) {
      suggestionsBox.style.display = "none";
    }
  });
}

/**
 * Récupère les suggestions (Artistes & Concours) correspondant à la requête
 */
function getSearchSuggestions(query) {
  const results = [];

  // Artistes uniques
  const artists = new Set(allDrawings.map(d => d.author_display_name).filter(Boolean));
  artists.forEach(artist => {
    if (artist.toLowerCase().includes(query)) {
      // Éviter de proposer un filtre déjà sélectionné
      if (!selectedFilters.some(f => f.type === 'author' && f.value.toLowerCase() === artist.toLowerCase())) {
        results.push({ type: 'author', label: artist, value: artist });
      }
    }
  });

  // Titres de concours uniques
  allContests.forEach(contest => {
    if (contest.title && contest.title.toLowerCase().includes(query)) {
      if (!selectedFilters.some(f => f.type === 'contest' && f.value.toLowerCase() === contest.title.toLowerCase())) {
        results.push({ type: 'contest', label: contest.title, value: contest.title, contestId: contest.id });
      }
    }
  });

  return results;
}

/**
 * Affiche la liste des suggestions dans le DOM
 */
function renderSuggestions(suggestions) {
  const suggestionsBox = document.getElementById("search-suggestions");
  suggestionsBox.innerHTML = "";

  if (suggestions.length === 0) {
    suggestionsBox.style.display = "none";
    return;
  }

  suggestions.forEach(item => {
    const div = document.createElement("div");
    div.classList.add("suggestion-item");
    div.innerHTML = `
      <span>${escapeHtml(item.label)}</span>
      <span class="suggestion-type">${item.type === 'author' ? 'Artiste' : 'Concours'}</span>
    `;

    // Clic sur une proposition -> Ajout du filtre tagué
    div.addEventListener("click", () => {
      addFilterTag(item);
      document.getElementById("search-input").value = "";
      suggestionsBox.style.display = "none";
    });

    suggestionsBox.appendChild(div);
  });

  suggestionsBox.style.display = "block";
}

/**
 * Ajoute un filtre validé sous forme de tag (pill) bleu
 */
function addFilterTag(filterItem) {
  selectedFilters.push(filterItem);

  const tagsContainer = document.getElementById("search-tags-container");
  const input = document.getElementById("search-input");

  const tagEl = document.createElement("div");
  tagEl.classList.add("search-tag");
  tagEl.innerHTML = `
    <span class="remove-tag">×</span>
    <span>${escapeHtml(filterItem.label)}</span>
  `;

  // Clic sur '×' pour supprimer le filtre
  tagEl.querySelector(".remove-tag").addEventListener("click", () => {
    selectedFilters = selectedFilters.filter(f => !(f.type === filterItem.type && f.value === filterItem.value));
    tagEl.remove();
  });

  // Insérer le tag juste avant l'input
  tagsContainer.insertBefore(tagEl, input);
  input.focus();
}

/**
 * Exécute la recherche et affiche tous les dessins correspondant aux filtres validés
 */
function performFilteredSearch() {
  setActiveNav(null); // Désactive l'étoile des onglets fixes

  const main = document.getElementById("main-content");
  main.innerHTML = "";

  if (selectedFilters.length === 0) {
    main.innerHTML = `<h2 class="contest-title-header">Recherche</h2><p>Veuillez sélectionner au moins un filtre dans la barre de recherche.</p>`;
    return;
  }

  // Filtrer la liste globale des dessins selon TOUS les filtres validés
  const matchingDrawings = allDrawings.filter(drawing => {
    return selectedFilters.every(filter => {
      if (filter.type === 'author') {
        return drawing.author_display_name && drawing.author_display_name.toLowerCase() === filter.value.toLowerCase();
      }
      if (filter.type === 'contest') {
        return drawing.contest_title && drawing.contest_title.toLowerCase() === filter.value.toLowerCase();
      }
      return false;
    });
  });

  // Titre de résumé des filtres
  const filterNames = selectedFilters.map(f => f.label).join(", ");
  const titleHeader = document.createElement("h2");
  titleHeader.classList.add("contest-title-header");
  titleHeader.textContent = `Résultats pour : ${filterNames} (${matchingDrawings.length})`;
  main.appendChild(titleHeader);

  // Grille des résultats
  const gridSection = document.createElement("div");
  gridSection.classList.add("grid-5");
  
  if (matchingDrawings.length > 0) {
    matchingDrawings.forEach(drawing => {
      gridSection.appendChild(createDrawingCard(drawing));
    });
    main.appendChild(gridSection);
  } else {
    main.appendChild(document.createTextNode("Aucun dessin ne correspond à cette combinaison de filtres."));
  }
}