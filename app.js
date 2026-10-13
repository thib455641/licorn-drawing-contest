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
  const orphanDrawings = allDrawings.filter(d => d.contest_id === "hors_concours" );
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
  setActiveNav(null);
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
  setActiveNav(null);
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <h2 class="contest-title-header">Concours : ${escapeHtml(contestTitle)}</h2>
    <div class="grid-5" id="filtered-grid"></div>
  `;

  const grid = document.getElementById("filtered-grid");
  const contestDrawings = allDrawings.filter(d => d.contest_id === contestId);

  contestDrawings.forEach(drawing => {
    grid.appendChild(createDrawingCard(drawing));
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

  // Clic sur le nom de l'artiste -> Filtre par artiste
  //const authorLink = card.querySelector(".author-link");
  //authorLink.addEventListener("click", () => {
  //  renderArtistFiltered(drawing.author_display_name);
  //});

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