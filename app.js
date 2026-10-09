document.addEventListener("DOMContentLoaded", () => {
  initGallery();
});

async function initGallery() {
  const container = document.getElementById("contests-container");

  try {
    // 1. Charger les deux fichiers JSON en parallèle
    const [contestsResponse, drawingsResponse] = await Promise.all([
      fetch("./data/contests.json"),
      fetch("./data/drawings.json")
    ]);

    if (!contestsResponse.ok || !drawingsResponse.ok) {
      throw new Error("Impossible de charger les fichiers JSON.");
    }

    const contests = await contestsResponse.json();
    const drawings = await drawingsResponse.json();

    // 2. Trier les concours du plus récent au plus ancien
    contests.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

    // Vider le message de chargement
    container.innerHTML = "";

    if (contests.length === 0) {
      container.innerHTML = "<p>Aucun concours disponible pour le moment.</p>";
      return;
    }

    // 3. Parcourir chaque concours pour afficher ses informations et ses dessins
    contests.forEach((contest, index) => {
      // La date de début
      const startDate = new Date(contest.start_date);
      const formattedStartDate = formatDate(startDate);

      // La date de fin correspond au début du concours suivant (plus récent chronologiquement dans la liste originale)
      // Comme la liste est triée du plus récent au plus ancien, le concours chronologiquement suivant est l'élément précédent dans le tableau (index - 1)
      let formattedEndDate = "En cours";
      if (index > 0) {
        const endDate = new Date(contests[index - 1].start_date);
        formattedEndDate = formatDate(endDate);
      }

      // Filtrer les dessins appartenant à ce concours
      const contestDrawings = drawings.filter(
        (drawing) => drawing.contest_id === contest.id
      );

      // Créer la section du concours
      const contestSection = document.createElement("section");
      contestSection.classList.add("contest-section");

      // HTML de l'en-tête du concours
      let sectionHTML = `
        <div class="contest-header">
          <h2>${escapeHtml(contest.title)}</h2>
          <p class="contest-dates">
            📅 Du <strong>${formattedStartDate}</strong> au <strong>${formattedEndDate}</strong>
          </p>
        </div>
      `;

      // HTML de la grille de dessins
      if (contestDrawings.length > 0) {
        sectionHTML += `<div class="drawings-grid">`;
        
        contestDrawings.forEach((drawing) => {
          const drawingDate = formatDate(new Date(drawing.created_at));

          sectionHTML += `
            <div class="drawing-card">
              <div class="drawing-image-wrapper">
                <img src="${escapeHtml(drawing.local_path)}" alt="Dessin de ${escapeHtml(drawing.author_display_name)}" loading="lazy">
              </div>
              <div class="drawing-info">
                <p class="author">👤 <strong>${escapeHtml(drawing.author_display_name)}</strong></p>
                <p class="date">🕒 ${drawingDate}</p>
              </div>
            </div>
          `;
        });

        sectionHTML += `</div>`;
      } else {
        sectionHTML += `<p class="no-drawings">Aucun dessin soumis pour ce concours pour l'instant.</p>`;
      }

      contestSection.innerHTML = sectionHTML;
      container.appendChild(contestSection);
    });

    // 4. Traiter les dessins "hors concours" s'il y en a
    const orphanDrawings = drawings.filter(
      (drawing) => drawing.contest_id === "hors_concours" || !drawing.contest_id
    );

    if (orphanDrawings.length > 0) {
      const orphanSection = document.createElement("section");
      orphanSection.classList.add("contest-section", "hors-concours");

      let orphanHTML = `
        <div class="contest-header">
          <h2>Dessins Hors Concours</h2>
        </div>
        <div class="drawings-grid">
      `;

      orphanDrawings.forEach((drawing) => {
        const drawingDate = formatDate(new Date(drawing.created_at));
        orphanHTML += `
          <div class="drawing-card">
            <div class="drawing-image-wrapper">
              <img src="${escapeHtml(drawing.local_path)}" alt="Dessin de ${escapeHtml(drawing.author_display_name)}" loading="lazy">
            </div>
            <div class="drawing-info">
              <p class="author">👤 <strong>${escapeHtml(drawing.author_display_name)}</strong></p>
              <p class="date">🕒 ${drawingDate}</p>
            </div>
          </div>
        `;
      });

      orphanHTML += `</div>`;
      orphanSection.innerHTML = orphanHTML;
      container.appendChild(orphanSection);
    }

  } catch (error) {
    console.error("Erreur lors de l'initialisation de la galerie :", error);
    container.innerHTML = `<p class="error">Erreur d'affichage de la galerie. Vérifiez que les fichiers JSON sont accessibles.</p>`;
  }
}

/**
 * Fonction utilitaire pour meubler proprement le formatage de date en français
 */
function formatDate(date) {
  if (isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

/**
 * Sécurisation contre l'injection HTML (XSS)
 */
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}