// ============================================================
// photos.js — Module "Dossier Photos" pour Planif'Chantier
// À inclure via <script src="photos.js"></script> dans index.html
// ============================================================

(function () {
  'use strict';

  // --- Stockage IndexedDB pour les photos (localStorage trop petit pour images) ---
  const DB_NAME = 'PlanifChantierPhotos';
  const DB_VERSION = 1;
  const STORE_NAME = 'photos';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function savePhotoToDB(projectName, dataUrl, fileName, dateAdded) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.add({ project: projectName, dataUrl, fileName, dateAdded });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getPhotosForProject(projectName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result.filter(p => p.project === projectName);
        resolve(all);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function deletePhotoFromDB(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteAllPhotosForProject(projectName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const toDelete = req.result.filter(p => p.project === projectName);
        toDelete.forEach(p => store.delete(p.id));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Obtenir le nom du projet actuel ---
  function getCurrentProjectName() {
    // Essaye de lire le champ "Projet" ou "Rue" de ton app
    const projetInput = document.getElementById('projet') || document.querySelector('input[placeholder*="rojet"]');
    const rueInput = document.getElementById('rue') || document.querySelector('input[placeholder*="ue"]');
    let name = '';
    if (projetInput && projetInput.value.trim()) name = projetInput.value.trim();
    else if (rueInput && rueInput.value.trim()) name = rueInput.value.trim();
    else name = 'Projet sans nom';
    return name;
  }

  // --- Créer le HTML du dossier photos ---
  function createPhotoFolderUI() {
    // === Bouton principal "📁 Dossier Photos" à ajouter à côté des autres boutons ===
    const btnContainer = document.querySelector('.button-group') ||
      document.querySelector('.actions') ||
      findButtonContainer();

    if (!btnContainer) {
      console.warn('[photos.js] Container de boutons non trouvé, ajout au body.');
    }

    const openFolderBtn = document.createElement('button');
    openFolderBtn.id = 'btn-open-photo-folder';
    openFolderBtn.innerHTML = '📁 Dossier Photos';
    openFolderBtn.className = 'photo-folder-btn';
    openFolderBtn.title = 'Ouvrir le dossier photos du projet';
    openFolderBtn.addEventListener('click', openPhotoFolder);

    // Insère le bouton après "Exporter en PDF" ou à la fin
    if (btnContainer) {
      const exportBtn = Array.from(btnContainer.querySelectorAll('button')).find(b =>
        b.textContent.includes('Exporter') || b.textContent.includes('PDF')
      );
      if (exportBtn && exportBtn.nextSibling) {
        btnContainer.insertBefore(openFolderBtn, exportBtn.nextSibling);
      } else {
        btnContainer.appendChild(openFolderBtn);
      }
    } else {
      document.body.appendChild(openFolderBtn);
    }

    // === Modal / Overlay "Dossier Photos" ===
    const overlay = document.createElement('div');
    overlay.id = 'photo-folder-overlay';
    overlay.className = 'photo-overlay hidden';
    overlay.innerHTML = `
      <div class="photo-folder-window">
        <div class="photo-folder-titlebar">
          <div class="photo-folder-titlebar-left">
            <span class="photo-folder-icon">📁</span>
            <span class="photo-folder-title">Dossier Photos — <span id="photo-folder-project-name">Projet</span></span>
          </div>
          <button class="photo-folder-close" id="photo-folder-close-btn" title="Fermer">✕</button>
        </div>
        <div class="photo-folder-toolbar">
          <button class="photo-import-btn" id="photo-import-btn">
            <span class="photo-import-icon">📷</span> Importer photo(s)
          </button>
          <span class="photo-count" id="photo-count">0 photo(s)</span>
        </div>
        <div class="photo-folder-grid" id="photo-folder-grid">
          <div class="photo-empty-state" id="photo-empty-state">
            <div class="photo-empty-icon">🖼️</div>
            <p>Aucune photo dans ce dossier</p>
            <p class="photo-empty-hint">Cliquez sur "Importer photo(s)" pour ajouter des images</p>
          </div>
        </div>
      </div>
      <input type="file" id="photo-file-input" accept="image/*" multiple style="display:none;" />
    `;
    document.body.appendChild(overlay);

    // === Modal lightbox pour voir une photo en grand ===
    const lightbox = document.createElement('div');
    lightbox.id = 'photo-lightbox';
    lightbox.className = 'photo-lightbox hidden';
    lightbox.innerHTML = `
      <div class="photo-lightbox-backdrop"></div>
      <div class="photo-lightbox-content">
        <img id="photo-lightbox-img" src="" alt="Photo agrandie" />
        <div class="photo-lightbox-info">
          <span id="photo-lightbox-name"></span>
          <span id="photo-lightbox-date"></span>
        </div>
        <button class="photo-lightbox-close" id="photo-lightbox-close">✕</button>
        <button class="photo-lightbox-prev" id="photo-lightbox-prev">‹</button>
        <button class="photo-lightbox-next" id="photo-lightbox-next">›</button>
      </div>
    `;
    document.body.appendChild(lightbox);

    // --- Événements ---
    document.getElementById('photo-folder-close-btn').addEventListener('click', closePhotoFolder);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePhotoFolder();
    });

    document.getElementById('photo-import-btn').addEventListener('click', () => {
      document.getElementById('photo-file-input').click();
    });

    document.getElementById('photo-file-input').addEventListener('change', handleFileImport);

    document.getElementById('photo-lightbox-close').addEventListener('click', closeLightbox);
    document.querySelector('.photo-lightbox-backdrop').addEventListener('click', closeLightbox);
    document.getElementById('photo-lightbox-prev').addEventListener('click', () => navigateLightbox(-1));
    document.getElementById('photo-lightbox-next').addEventListener('click', () => navigateLightbox(1));

    // Touche Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!document.getElementById('photo-lightbox').classList.contains('hidden')) {
          closeLightbox();
        } else if (!overlay.classList.contains('hidden')) {
          closePhotoFolder();
        }
      }
      if (!document.getElementById('photo-lightbox').classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') navigateLightbox(-1);
        if (e.key === 'ArrowRight') navigateLightbox(1);
      }
    });
  }

  // --- Trouver le container des boutons en bas ---
  function findButtonContainer() {
    // Cherche le parent qui contient les boutons Sauvegarder / Exporter
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      if (btn.textContent.includes('Sauvegarder') || btn.textContent.includes('Exporter')) {
        return btn.parentElement;
      }
    }
    return null;
  }

  // --- Ouvrir le dossier photos ---
  async function openPhotoFolder() {
    const overlay = document.getElementById('photo-folder-overlay');
    const projectName = getCurrentProjectName();
    document.getElementById('photo-folder-project-name').textContent = projectName;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    await renderPhotos();
  }

  function closePhotoFolder() {
    document.getElementById('photo-folder-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }

  // --- Import de fichiers ---
  async function handleFileImport(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const projectName = getCurrentProjectName();

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;

      const dataUrl = await readFileAsDataUrl(file);
      // Compresser si trop gros (> 2MB)
      const finalDataUrl = file.size > 2 * 1024 * 1024
        ? await compressImage(dataUrl, 1600, 0.8)
        : dataUrl;

      await savePhotoToDB(projectName, finalDataUrl, file.name, new Date().toISOString());
    }

    // Reset input pour pouvoir re-sélectionner les mêmes fichiers
    e.target.value = '';
    await renderPhotos();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  function compressImage(dataUrl, maxDim, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  }

  // --- Affichage de la grille de photos ---
  let currentPhotos = [];
  let currentLightboxIndex = 0;

  async function renderPhotos() {
    const projectName = getCurrentProjectName();
    const photos = await getPhotosForProject(projectName);
    currentPhotos = photos;
    const grid = document.getElementById('photo-folder-grid');
    const emptyState = document.getElementById('photo-empty-state');
    const countEl = document.getElementById('photo-count');

    countEl.textContent = `${photos.length} photo(s)`;

    // Vider la grille (sauf le empty state)
    grid.querySelectorAll('.photo-card').forEach(c => c.remove());

    if (photos.length === 0) {
      emptyState.style.display = '';
      return;
    }
    emptyState.style.display = 'none';

    photos.forEach((photo, idx) => {
      const card = document.createElement('div');
      card.className = 'photo-card';
      card.innerHTML = `
        <div class="photo-card-img-wrap">
          <img src="${photo.dataUrl}" alt="${photo.fileName}" loading="lazy" />
        </div>
        <div class="photo-card-info">
          <span class="photo-card-name" title="${photo.fileName}">${truncate(photo.fileName, 20)}</span>
          <span class="photo-card-date">${formatDate(photo.dateAdded)}</span>
        </div>
        <button class="photo-card-delete" title="Supprimer cette photo">🗑️</button>
      `;

      // Clic pour ouvrir en grand
      card.querySelector('.photo-card-img-wrap').addEventListener('click', () => {
        openLightbox(idx);
      });

      // Supprimer
      card.querySelector('.photo-card-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Supprimer cette photo ?')) {
          await deletePhotoFromDB(photo.id);
          await renderPhotos();
        }
      });

      grid.appendChild(card);
    });
  }

  function truncate(str, max) {
    if (str.length <= max) return str;
    const ext = str.lastIndexOf('.') > -1 ? str.slice(str.lastIndexOf('.')) : '';
    return str.slice(0, max - ext.length - 3) + '...' + ext;
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
        ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  // --- Lightbox ---
  function openLightbox(index) {
    currentLightboxIndex = index;
    const lb = document.getElementById('photo-lightbox');
    lb.classList.remove('hidden');
    updateLightbox();
  }

  function closeLightbox() {
    document.getElementById('photo-lightbox').classList.add('hidden');
  }

  function navigateLightbox(dir) {
    currentLightboxIndex += dir;
    if (currentLightboxIndex < 0) currentLightboxIndex = currentPhotos.length - 1;
    if (currentLightboxIndex >= currentPhotos.length) currentLightboxIndex = 0;
    updateLightbox();
  }

  function updateLightbox() {
    const photo = currentPhotos[currentLightboxIndex];
    if (!photo) return;
    document.getElementById('photo-lightbox-img').src = photo.dataUrl;
    document.getElementById('photo-lightbox-name').textContent = photo.fileName;
    document.getElementById('photo-lightbox-date').textContent = formatDate(photo.dateAdded);
  }

  // --- Hook dans le système de sauvegarde existant ---
  // On patche les fonctions existantes de sauvegarde/chargement pour inclure les photos
  function hookIntoSaveSystem() {
    // Observer les clics sur le bouton Sauvegarder existant
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      if (btn.textContent.includes('Sauvegarder') && btn.id !== 'btn-open-photo-folder') {
        const originalClick = btn.onclick;
        btn.addEventListener('click', () => {
          // Les photos sont déjà dans IndexedDB et liées par nom de projet
          // Pas besoin de faire quoi que ce soit de plus ici
          console.log('[photos.js] Projet sauvegardé — les photos sont persistées dans IndexedDB.');
        });
        break;
      }
    }
  }

  // --- Exporter les photos avec le projet (pour les intégrer au JSON exporté) ---
  // Expose des fonctions globales pour que le code existant puisse les utiliser si besoin
  window.PhotoModule = {
    getPhotosForProject,
    savePhotoToDB,
    deletePhotoFromDB,
    deleteAllPhotosForProject,
    getCurrentProjectName,

    // Pour intégrer dans l'export JSON existant
    async exportPhotosAsJSON() {
      const projectName = getCurrentProjectName();
      const photos = await getPhotosForProject(projectName);
      return photos.map(p => ({
        fileName: p.fileName,
        dateAdded: p.dateAdded,
        dataUrl: p.dataUrl
      }));
    },

    // Pour importer depuis un JSON chargé
    async importPhotosFromJSON(projectName, photosArray) {
      if (!Array.isArray(photosArray)) return;
      for (const p of photosArray) {
        await savePhotoToDB(projectName, p.dataUrl, p.fileName, p.dateAdded);
      }
    }
  };

  // --- Injection du CSS ---
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* ======================== Bouton Dossier Photos ======================== */
      .photo-folder-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 18px;
        font-size: 15px;
        font-weight: 600;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        background: linear-gradient(135deg, #4a90d9, #357abd);
        color: #fff;
        box-shadow: 0 2px 8px rgba(74,144,217,0.3);
        transition: all 0.2s ease;
        margin: 4px;
      }
      .photo-folder-btn:hover {
        background: linear-gradient(135deg, #357abd, #2a6aad);
        box-shadow: 0 4px 14px rgba(74,144,217,0.45);
        transform: translateY(-1px);
      }
      .photo-folder-btn:active {
        transform: translateY(0);
      }

      /* ======================== Overlay / Fenêtre dossier ======================== */
      .photo-overlay {
        position: fixed;
        inset: 0;
        z-index: 9000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(4px);
        animation: photoFadeIn 0.25s ease;
      }
      .photo-overlay.hidden { display: none; }

      @keyframes photoFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .photo-folder-window {
        width: 92vw;
        max-width: 900px;
        height: 80vh;
        max-height: 700px;
        background: #1e1e2e;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        animation: photoSlideUp 0.3s ease;
      }
      @keyframes photoSlideUp {
        from { transform: translateY(30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      /* --- Barre de titre style Windows --- */
      .photo-folder-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        background: #181825;
        border-bottom: 1px solid #313244;
        flex-shrink: 0;
      }
      .photo-folder-titlebar-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .photo-folder-icon { font-size: 18px; }
      .photo-folder-title {
        font-size: 14px;
        font-weight: 600;
        color: #cdd6f4;
      }
      .photo-folder-close {
        background: none;
        border: none;
        color: #6c7086;
        font-size: 18px;
        cursor: pointer;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
      }
      .photo-folder-close:hover {
        background: #e64553;
        color: #fff;
      }

      /* --- Toolbar --- */
      .photo-folder-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        background: #1e1e2e;
        border-bottom: 1px solid #313244;
        flex-shrink: 0;
      }
      .photo-import-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 600;
        border: 2px dashed #45475a;
        border-radius: 8px;
        cursor: pointer;
        background: transparent;
        color: #89b4fa;
        transition: all 0.2s;
      }
      .photo-import-btn:hover {
        border-color: #89b4fa;
        background: rgba(137,180,250,0.08);
      }
      .photo-import-icon { font-size: 16px; }
      .photo-count {
        font-size: 13px;
        color: #6c7086;
        font-weight: 500;
      }

      /* --- Grille de photos --- */
      .photo-folder-grid {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 12px;
        align-content: start;
      }
      .photo-folder-grid::-webkit-scrollbar { width: 8px; }
      .photo-folder-grid::-webkit-scrollbar-track { background: #11111b; }
      .photo-folder-grid::-webkit-scrollbar-thumb { background: #45475a; border-radius: 4px; }

      /* --- Carte photo --- */
      .photo-card {
        background: #181825;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid #313244;
        position: relative;
        transition: all 0.2s;
        animation: photoCardIn 0.3s ease both;
      }
      .photo-card:hover {
        border-color: #89b4fa;
        box-shadow: 0 4px 16px rgba(137,180,250,0.15);
        transform: translateY(-2px);
      }
      @keyframes photoCardIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }

      .photo-card-img-wrap {
        width: 100%;
        aspect-ratio: 1;
        overflow: hidden;
        cursor: pointer;
        background: #11111b;
      }
      .photo-card-img-wrap img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s;
      }
      .photo-card:hover .photo-card-img-wrap img {
        transform: scale(1.05);
      }

      .photo-card-info {
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .photo-card-name {
        font-size: 12px;
        color: #cdd6f4;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .photo-card-date {
        font-size: 11px;
        color: #6c7086;
      }

      .photo-card-delete {
        position: absolute;
        top: 6px;
        right: 6px;
        background: rgba(17,17,27,0.8);
        border: none;
        border-radius: 6px;
        width: 30px;
        height: 30px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s;
      }
      .photo-card:hover .photo-card-delete { opacity: 1; }
      .photo-card-delete:hover { background: #e64553; }

      /* --- Empty state --- */
      .photo-empty-state {
        grid-column: 1 / -1;
        text-align: center;
        padding: 40px 20px;
        color: #6c7086;
      }
      .photo-empty-icon { font-size: 48px; margin-bottom: 12px; }
      .photo-empty-state p { margin: 4px 0; }
      .photo-empty-hint { font-size: 13px; color: #45475a; }

      /* ======================== Lightbox ======================== */
      .photo-lightbox {
        position: fixed;
        inset: 0;
        z-index: 9500;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .photo-lightbox.hidden { display: none; }

      .photo-lightbox-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.85);
      }

      .photo-lightbox-content {
        position: relative;
        max-width: 90vw;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .photo-lightbox-content img {
        max-width: 90vw;
        max-height: 80vh;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.6);
      }
      .photo-lightbox-info {
        display: flex;
        gap: 16px;
        margin-top: 10px;
        color: #a6adc8;
        font-size: 13px;
      }

      .photo-lightbox-close {
        position: absolute;
        top: -40px;
        right: 0;
        background: none;
        border: none;
        color: #fff;
        font-size: 28px;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s;
      }
      .photo-lightbox-close:hover { opacity: 1; }

      .photo-lightbox-prev,
      .photo-lightbox-next {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(255,255,255,0.1);
        border: none;
        color: #fff;
        font-size: 36px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      .photo-lightbox-prev { left: -60px; }
      .photo-lightbox-next { right: -60px; }
      .photo-lightbox-prev:hover,
      .photo-lightbox-next:hover {
        background: rgba(255,255,255,0.2);
      }

      /* ======================== Thème clair (optionnel) ======================== */
      body:not(.dark-mode) .photo-folder-window,
      body.light-mode .photo-folder-window {
        background: #eff1f5;
      }
      body:not(.dark-mode) .photo-folder-titlebar,
      body.light-mode .photo-folder-titlebar {
        background: #e6e9ef;
        border-color: #ccd0da;
      }
      body:not(.dark-mode) .photo-folder-title,
      body.light-mode .photo-folder-title { color: #4c4f69; }
      body:not(.dark-mode) .photo-folder-toolbar,
      body.light-mode .photo-folder-toolbar {
        background: #eff1f5;
        border-color: #ccd0da;
      }
      body:not(.dark-mode) .photo-import-btn,
      body.light-mode .photo-import-btn {
        border-color: #ccd0da;
        color: #1e66f5;
      }
      body:not(.dark-mode) .photo-card,
      body.light-mode .photo-card {
        background: #e6e9ef;
        border-color: #ccd0da;
      }
      body:not(.dark-mode) .photo-card-name,
      body.light-mode .photo-card-name { color: #4c4f69; }
      body:not(.dark-mode) .photo-card-img-wrap,
      body.light-mode .photo-card-img-wrap { background: #dce0e8; }
      body:not(.dark-mode) .photo-folder-grid::-webkit-scrollbar-track,
      body.light-mode .photo-folder-grid::-webkit-scrollbar-track { background: #e6e9ef; }

      /* ======================== Responsive ======================== */
      @media (max-width: 600px) {
        .photo-folder-window {
          width: 100vw;
          height: 100vh;
          max-width: none;
          max-height: none;
          border-radius: 0;
        }
        .photo-folder-grid {
          grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
          gap: 8px;
          padding: 10px;
        }
        .photo-lightbox-prev { left: 5px; }
        .photo-lightbox-next { right: 5px; }
        .photo-lightbox-prev,
        .photo-lightbox-next {
          width: 40px;
          height: 40px;
          font-size: 28px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // --- Initialisation ---
  function init() {
    injectStyles();
    createPhotoFolderUI();
    hookIntoSaveSystem();
    console.log('[photos.js] Module Dossier Photos initialisé ✓');
  }

  // Lancer quand le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
