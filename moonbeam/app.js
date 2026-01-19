// State
let selectedFile = null;
let selectedShow = null;
let currentScriptId = null;
let searchTimeout = null;
let folderHandle = null;
let editSelectedShow = null;
let browserSelectedFiles = [];

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const setupApiKey = document.getElementById('setup-api-key');
const setupBtn = document.getElementById('setup-btn');
const app = document.getElementById('app');
const emptyState = document.getElementById('empty-state');
const posterGrid = document.getElementById('poster-grid');

// Modals
const uploadModal = document.getElementById('upload-modal');
const detailModal = document.getElementById('detail-modal');
const settingsModal = document.getElementById('settings-modal');
const browserModal = document.getElementById('browser-modal');
const editModal = document.getElementById('edit-modal');
const posterModal = document.getElementById('poster-modal');
const collageModal = document.getElementById('collage-modal');

// Upload elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileSelected = document.getElementById('file-selected');
const fileName = document.getElementById('file-name');
const removeFileBtn = document.getElementById('remove-file');
const metadataForm = document.getElementById('metadata-form');
const titleInput = document.getElementById('title-input');
const dateInput = document.getElementById('date-input');
const searchResults = document.getElementById('search-results');
const selectedShowEl = document.getElementById('selected-show');
const saveScriptBtn = document.getElementById('save-script');

// Settings
const apiKeyInput = document.getElementById('api-key-input');
const folderPathEl = document.getElementById('folder-path');

// TMDB
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

// Initialize
async function init() {
    await scriptDB.init();

    // Check if API key exists
    if (localStorage.getItem('tmdb_api_key')) {
        showApp();
    }

    setupEventListeners();
}

function setupEventListeners() {
    // Setup screen
    setupBtn.addEventListener('click', handleSetup);
    setupApiKey.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSetup();
    });

    // Upload buttons
    document.getElementById('upload-btn').addEventListener('click', openUploadModal);
    document.getElementById('empty-upload-btn').addEventListener('click', openUploadModal);

    // Settings
    document.getElementById('settings-btn').addEventListener('click', openSettingsModal);
    document.getElementById('save-settings').addEventListener('click', saveSettings);

    // Folder & Data
    document.getElementById('connect-folder-btn').addEventListener('click', connectFolder);
    document.getElementById('export-data-btn').addEventListener('click', exportData);
    document.getElementById('import-data-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', importData);

    // Modal closes
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
        el.addEventListener('click', closeAllModals);
    });
    document.getElementById('cancel-upload').addEventListener('click', closeAllModals);

    // File upload
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    removeFileBtn.addEventListener('click', clearFile);

    // Title search
    titleInput.addEventListener('input', handleTitleInput);
    document.getElementById('change-selection').addEventListener('click', changeSelection);

    // Save script
    saveScriptBtn.addEventListener('click', saveScript);

    // Delete script
    document.getElementById('delete-script').addEventListener('click', deleteScript);

    // Edit script
    document.getElementById('edit-script').addEventListener('click', openEditModal);
    document.getElementById('edit-cancel').addEventListener('click', closeAllModals);
    document.getElementById('edit-save').addEventListener('click', saveEditedScript);
    document.getElementById('edit-title-input').addEventListener('input', handleEditTitleInput);
    document.getElementById('edit-change-selection').addEventListener('click', editChangeSelection);

    // Folder browser
    document.getElementById('browse-folder-btn').addEventListener('click', openBrowserModal);
    document.getElementById('browser-cancel').addEventListener('click', closeAllModals);
    document.getElementById('browser-import').addEventListener('click', importSelectedFiles);

    // Poster zoom
    document.getElementById('detail-poster').addEventListener('click', openPosterZoom);
    document.querySelector('.poster-zoom-close').addEventListener('click', closePosterZoom);
    document.querySelector('#poster-modal .modal-backdrop').addEventListener('click', closePosterZoom);
    document.getElementById('poster-download-btn').addEventListener('click', downloadPoster);

    // Collage
    document.getElementById('generate-collage-btn').addEventListener('click', openCollageModal);
    document.getElementById('collage-cancel').addEventListener('click', closeAllModals);
    document.getElementById('collage-regenerate').addEventListener('click', generateCollage);
    document.getElementById('collage-download').addEventListener('click', downloadCollage);

    // Stop propagation for modal content
    document.querySelectorAll('.modal-content').forEach(el => {
        el.addEventListener('click', (e) => e.stopPropagation());
    });

    // Date input change handler
    dateInput?.addEventListener('change', updateSaveButton);
}

// Setup
function handleSetup() {
    const apiKey = setupApiKey.value.trim();
    if (!apiKey) {
        alert('Please enter your TMDB API key');
        return;
    }
    localStorage.setItem('tmdb_api_key', apiKey);
    showApp();
}

async function showApp() {
    setupScreen.classList.add('hidden');
    app.classList.remove('hidden');

    // Load API key into settings
    const apiKey = localStorage.getItem('tmdb_api_key');
    if (apiKey) {
        apiKeyInput.value = apiKey;
    }

    // Update folder status
    updateFolderStatus();

    await loadScripts();
}

// Folder Connection
async function connectFolder() {
    try {
        if (!('showDirectoryPicker' in window)) {
            alert('Your browser does not support folder access. Please use Chrome or Edge.');
            return;
        }

        folderHandle = await window.showDirectoryPicker({
            mode: 'read'
        });

        localStorage.setItem('moonbeam_folder_name', folderHandle.name);
        updateFolderStatus();
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Folder connection error:', err);
            alert('Could not connect to folder');
        }
    }
}

function updateFolderStatus() {
    const folderName = localStorage.getItem('moonbeam_folder_name');
    if (folderHandle) {
        folderPathEl.textContent = folderHandle.name;
        folderPathEl.classList.add('connected');
    } else if (folderName) {
        folderPathEl.textContent = `${folderName} (reconnect needed)`;
        folderPathEl.classList.remove('connected');
    } else {
        folderPathEl.textContent = 'No folder connected';
        folderPathEl.classList.remove('connected');
    }
}

async function getFileFromFolder(fileName) {
    if (!folderHandle) return null;

    try {
        // Try to find file in folder (including subdirectories)
        return await findFileInDirectory(folderHandle, fileName);
    } catch (err) {
        console.error('Error reading file from folder:', err);
        return null;
    }
}

async function findFileInDirectory(dirHandle, fileName) {
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name === fileName) {
            return await entry.getFile();
        } else if (entry.kind === 'directory') {
            const found = await findFileInDirectory(entry, fileName);
            if (found) return found;
        }
    }
    return null;
}

// Export/Import Data
async function exportData() {
    const scripts = await scriptDB.getAllScripts();

    // Create export object (without file data)
    const exportObj = {
        version: 1,
        exportedAt: new Date().toISOString(),
        apiKey: localStorage.getItem('tmdb_api_key') || '',
        scripts: scripts.map(s => ({
            title: s.title,
            tmdbId: s.tmdbId,
            tmdbType: s.tmdbType,
            year: s.year,
            overview: s.overview,
            posterUrl: s.posterUrl,
            dateWorked: s.dateWorked,
            fileName: s.fileName,
            fileType: s.fileType,
            createdAt: s.createdAt
        }))
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'moonbeam-data.json';
    a.click();

    URL.revokeObjectURL(url);
}

async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.scripts || !Array.isArray(data.scripts)) {
            throw new Error('Invalid data format');
        }

        // Import API key if present
        if (data.apiKey) {
            localStorage.setItem('tmdb_api_key', data.apiKey);
            apiKeyInput.value = data.apiKey;
        }

        // Import scripts
        let imported = 0;
        for (const script of data.scripts) {
            // Check if script with same fileName already exists
            const existing = await scriptDB.getAllScripts();
            const exists = existing.some(s => s.fileName === script.fileName);

            if (!exists) {
                await scriptDB.addScript({
                    title: script.title,
                    tmdbId: script.tmdbId,
                    tmdbType: script.tmdbType,
                    year: script.year,
                    overview: script.overview,
                    posterUrl: script.posterUrl,
                    dateWorked: script.dateWorked,
                    fileName: script.fileName,
                    fileType: script.fileType,
                    fileData: null, // Will be loaded from folder when needed
                    createdAt: script.createdAt || new Date().toISOString()
                });
                imported++;
            }
        }

        alert(`Imported ${imported} scripts. ${data.scripts.length - imported} already existed.`);
        await loadScripts();
    } catch (err) {
        console.error('Import error:', err);
        alert('Error importing data. Make sure the file is valid.');
    }

    // Reset file input
    e.target.value = '';
}

// Scripts
async function loadScripts() {
    const scripts = await scriptDB.getAllScripts();

    if (scripts.length === 0) {
        emptyState.classList.remove('hidden');
        posterGrid.classList.add('hidden');
    } else {
        emptyState.classList.add('hidden');
        posterGrid.classList.remove('hidden');
        renderPosterGrid(scripts);
    }
}

function renderPosterGrid(scripts) {
    posterGrid.innerHTML = scripts.map(script => `
        <div class="poster-card" data-id="${script.id}">
            <img src="${script.posterUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300" fill="%231a1a2e"%3E%3Crect width="200" height="300"/%3E%3Ctext x="100" y="150" text-anchor="middle" fill="%234a4a6a" font-family="sans-serif"%3ENo Poster%3C/text%3E%3C/svg%3E'}" alt="${script.title}">
            <div class="poster-overlay">
                <h3>${script.title}</h3>
                <p>${formatDate(script.dateWorked)}</p>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.poster-card').forEach(card => {
        card.addEventListener('click', () => openDetailModal(parseInt(card.dataset.id)));
    });
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Upload Modal
function openUploadModal() {
    resetUploadModal();
    uploadModal.classList.remove('hidden');
}

function resetUploadModal() {
    selectedFile = null;
    selectedShow = null;
    dropZone.classList.remove('hidden');
    fileSelected.classList.add('hidden');
    metadataForm.classList.add('hidden');
    selectedShowEl.classList.add('hidden');
    searchResults.classList.add('hidden');
    titleInput.value = '';
    dateInput.value = '';
    saveScriptBtn.disabled = true;
}

function clearFile() {
    resetUploadModal();
}

// Drag & Drop
function handleDragOver(e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        processFile(e.target.files[0]);
    }
}

function processFile(file) {
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

    if (!validTypes.includes(file.type) && !file.name.endsWith('.pdf') && !file.name.endsWith('.docx')) {
        alert('Please upload a PDF or DOCX file');
        return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    dropZone.classList.add('hidden');
    fileSelected.classList.remove('hidden');
    metadataForm.classList.remove('hidden');

    // Parse title from filename
    const suggestedTitle = parseTitle(file.name);
    titleInput.value = suggestedTitle;

    // Set default date to today
    dateInput.value = new Date().toISOString().split('T')[0];

    // Trigger search
    if (suggestedTitle) {
        searchTMDB(suggestedTitle);
    }
}

function parseTitle(filename) {
    // Remove extension
    let title = filename.replace(/\.(pdf|docx)$/i, '');

    // Replace underscores and hyphens with spaces
    title = title.replace(/[_-]/g, ' ');

    // Remove common patterns like S01E01, season/episode numbers
    title = title.replace(/\s*S\d+E\d+/gi, '');
    title = title.replace(/\s*\d+x\d+/gi, '');
    title = title.replace(/\s*season\s*\d+/gi, '');
    title = title.replace(/\s*episode\s*\d+/gi, '');
    title = title.replace(/\s*ep\s*\d+/gi, '');

    // Remove year in parentheses
    title = title.replace(/\s*\(\d{4}\)/g, '');

    // Clean up extra spaces
    title = title.replace(/\s+/g, ' ').trim();

    return title;
}

// TMDB Search
function handleTitleInput() {
    selectedShow = null;
    selectedShowEl.classList.add('hidden');
    updateSaveButton();

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        if (titleInput.value.length >= 2) {
            searchTMDB(titleInput.value);
        } else {
            searchResults.classList.add('hidden');
        }
    }, 300);
}

async function searchTMDB(query) {
    const apiKey = localStorage.getItem('tmdb_api_key');
    if (!apiKey) {
        searchResults.innerHTML = '<div class="search-result"><p style="padding: 1rem; color: var(--text-muted);">Please add your TMDB API key in settings</p></div>';
        searchResults.classList.remove('hidden');
        return;
    }

    try {
        // Search both movies and TV shows
        const [movieRes, tvRes] = await Promise.all([
            fetch(`${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`),
            fetch(`${TMDB_BASE}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}`)
        ]);

        const movies = await movieRes.json();
        const tvShows = await tvRes.json();

        const results = [
            ...movies.results.slice(0, 5).map(m => ({ ...m, media_type: 'movie' })),
            ...tvShows.results.slice(0, 5).map(t => ({ ...t, media_type: 'tv', title: t.name, release_date: t.first_air_date }))
        ].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 8);

        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-result"><p style="padding: 1rem; color: var(--text-muted);">No results found</p></div>';
        } else {
            searchResults.innerHTML = results.map(r => `
                <div class="search-result" data-id="${r.id}" data-type="${r.media_type}">
                    <img src="${r.poster_path ? `${TMDB_IMG}/w92${r.poster_path}` : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="60" fill="%231a1a2e"%3E%3Crect width="40" height="60"/%3E%3C/svg%3E'}" alt="">
                    <div class="search-result-info">
                        <h4>${r.title || r.name}</h4>
                        <p>${r.release_date ? r.release_date.split('-')[0] : 'Unknown'} • ${r.media_type === 'movie' ? 'Movie' : 'TV Show'}</p>
                    </div>
                </div>
            `).join('');
        }

        searchResults.classList.remove('hidden');

        // Add click handlers
        document.querySelectorAll('.search-result[data-id]').forEach(el => {
            el.addEventListener('click', () => selectShow(el.dataset.id, el.dataset.type));
        });
    } catch (err) {
        console.error('TMDB search error:', err);
        searchResults.innerHTML = '<div class="search-result"><p style="padding: 1rem; color: var(--danger);">Error searching. Check your API key.</p></div>';
        searchResults.classList.remove('hidden');
    }
}

async function selectShow(id, type) {
    const apiKey = localStorage.getItem('tmdb_api_key');
    const endpoint = type === 'movie' ? 'movie' : 'tv';

    try {
        const res = await fetch(`${TMDB_BASE}/${endpoint}/${id}?api_key=${apiKey}`);
        const data = await res.json();

        selectedShow = {
            id: data.id,
            type: type,
            title: data.title || data.name,
            year: (data.release_date || data.first_air_date || '').split('-')[0],
            overview: data.overview,
            posterPath: data.poster_path
        };

        document.getElementById('selected-poster').src = selectedShow.posterPath
            ? `${TMDB_IMG}/w154${selectedShow.posterPath}`
            : '';
        document.getElementById('selected-title').textContent = selectedShow.title;
        document.getElementById('selected-year').textContent = selectedShow.year;

        searchResults.classList.add('hidden');
        selectedShowEl.classList.remove('hidden');
        updateSaveButton();
    } catch (err) {
        console.error('Error fetching show details:', err);
    }
}

function changeSelection() {
    selectedShow = null;
    selectedShowEl.classList.add('hidden');
    titleInput.focus();
    updateSaveButton();
}

function updateSaveButton() {
    saveScriptBtn.disabled = !(selectedFile && selectedShow && dateInput.value);
}

// Save Script
async function saveScript() {
    if (!selectedFile || !selectedShow || !dateInput.value) return;

    // Read file as ArrayBuffer
    const fileData = await readFileAsArrayBuffer(selectedFile);

    const scriptData = {
        title: selectedShow.title,
        tmdbId: selectedShow.id,
        tmdbType: selectedShow.type,
        year: selectedShow.year,
        overview: selectedShow.overview,
        posterUrl: selectedShow.posterPath ? `${TMDB_IMG}/w500${selectedShow.posterPath}` : null,
        dateWorked: dateInput.value,
        fileName: selectedFile.name,
        fileType: selectedFile.type || (selectedFile.name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        fileData: fileData,
        createdAt: new Date().toISOString()
    };

    await scriptDB.addScript(scriptData);
    closeAllModals();
    await loadScripts();
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// Detail Modal
async function openDetailModal(id) {
    currentScriptId = id;
    const script = await scriptDB.getScript(id);

    if (!script) return;

    document.getElementById('detail-title').textContent = script.title;
    document.getElementById('detail-poster').src = script.posterUrl || '';
    document.getElementById('detail-year').textContent = script.year || 'Unknown';
    document.getElementById('detail-date').textContent = formatDate(script.dateWorked);
    document.getElementById('detail-overview').textContent = script.overview || 'No description available.';

    // Load script viewer
    const viewer = document.getElementById('script-viewer');
    viewer.innerHTML = '<p style="text-align: center; padding: 2rem; color: #666;">Loading script...</p>';

    detailModal.classList.remove('hidden');

    // Get file data - either from IndexedDB or from connected folder
    let fileData = script.fileData;

    if (!fileData && folderHandle) {
        // Try to get file from connected folder
        const file = await getFileFromFolder(script.fileName);
        if (file) {
            fileData = await readFileAsArrayBuffer(file);
        }
    }

    if (!fileData) {
        viewer.innerHTML = '<p style="text-align: center; padding: 2rem; color: #666;">Script file not found. Connect your scripts folder in settings to view.</p>';
        return;
    }

    // Render script
    if (script.fileType === 'application/pdf' || script.fileName.endsWith('.pdf')) {
        await renderPDF(fileData, viewer);
    } else {
        await renderDOCX(fileData, viewer);
    }
}

async function renderPDF(arrayBuffer, container) {
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        container.innerHTML = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const scale = 1.5;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport }).promise;
            container.appendChild(canvas);
        }
    } catch (err) {
        console.error('PDF render error:', err);
        container.innerHTML = '<p style="text-align: center; padding: 2rem; color: #dc2626;">Error loading PDF</p>';
    }
}

async function renderDOCX(arrayBuffer, container) {
    try {
        const result = await mammoth.convertToHtml({ arrayBuffer });
        container.innerHTML = result.value;
    } catch (err) {
        console.error('DOCX render error:', err);
        container.innerHTML = '<p style="text-align: center; padding: 2rem; color: #dc2626;">Error loading document</p>';
    }
}

async function deleteScript() {
    if (!currentScriptId) return;

    if (confirm('Are you sure you want to delete this script?')) {
        await scriptDB.deleteScript(currentScriptId);
        closeAllModals();
        await loadScripts();
    }
}

// Settings Modal
function openSettingsModal() {
    updateFolderStatus();
    settingsModal.classList.remove('hidden');
}

function saveSettings() {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
        localStorage.setItem('tmdb_api_key', apiKey);
        closeAllModals();
    } else {
        alert('API key is required. Enter a key or refresh to go back to setup.');
    }
}

// Modal helpers
function closeAllModals() {
    uploadModal.classList.add('hidden');
    detailModal.classList.add('hidden');
    settingsModal.classList.add('hidden');
    browserModal.classList.add('hidden');
    editModal.classList.add('hidden');
    posterModal.classList.add('hidden');
    collageModal.classList.add('hidden');
}

// ==========================================
// FOLDER BROWSER
// ==========================================

async function openBrowserModal() {
    browserSelectedFiles = [];
    const browserList = document.getElementById('browser-list');
    const browserEmpty = document.getElementById('browser-empty');
    const importBtn = document.getElementById('browser-import');

    importBtn.disabled = true;

    if (!folderHandle) {
        // Try to connect folder first
        try {
            if (!('showDirectoryPicker' in window)) {
                alert('Your browser does not support folder access. Please use Chrome or Edge.');
                return;
            }
            folderHandle = await window.showDirectoryPicker({ mode: 'read' });
            localStorage.setItem('moonbeam_folder_name', folderHandle.name);
            updateFolderStatus();
        } catch (err) {
            if (err.name !== 'AbortError') {
                alert('Could not connect to folder');
            }
            return;
        }
    }

    browserModal.classList.remove('hidden');
    browserList.innerHTML = '<p style="padding: 1rem; text-align: center;">Scanning folder...</p>';
    browserList.classList.remove('hidden');
    browserEmpty.classList.add('hidden');

    // Get all script files from folder
    const files = await getAllScriptFiles(folderHandle);
    const existingScripts = await scriptDB.getAllScripts();
    const existingFileNames = new Set(existingScripts.map(s => s.fileName));

    if (files.length === 0) {
        browserList.innerHTML = '<p style="padding: 1rem; text-align: center; color: var(--text-muted);">No PDF or DOCX files found in folder.</p>';
        return;
    }

    browserList.innerHTML = files.map((f, i) => {
        const isAdded = existingFileNames.has(f.name);
        return `
            <div class="browser-item ${isAdded ? '' : ''}" data-index="${i}">
                <input type="checkbox" ${isAdded ? 'disabled' : ''}>
                <div class="browser-item-info">
                    <div class="browser-item-name">${f.name}</div>
                    <div class="browser-item-path">${f.path || ''}</div>
                </div>
                ${isAdded ? '<span class="browser-item-status added">Added</span>' : ''}
            </div>
        `;
    }).join('');

    // Store files for later access
    window._browserFiles = files;

    // Add click handlers
    document.querySelectorAll('.browser-item').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox.disabled) return;

        item.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                checkbox.checked = !checkbox.checked;
            }
            item.classList.toggle('selected', checkbox.checked);
            updateBrowserImportButton();
        });
    });
}

async function getAllScriptFiles(dirHandle, path = '') {
    const files = [];
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            const name = entry.name.toLowerCase();
            if (name.endsWith('.pdf') || name.endsWith('.docx')) {
                const file = await entry.getFile();
                file.path = path;
                file.handle = entry;
                files.push(file);
            }
        } else if (entry.kind === 'directory') {
            const subFiles = await getAllScriptFiles(entry, path ? `${path}/${entry.name}` : entry.name);
            files.push(...subFiles);
        }
    }
    return files.sort((a, b) => a.name.localeCompare(b.name));
}

function updateBrowserImportButton() {
    const checked = document.querySelectorAll('.browser-item input[type="checkbox"]:checked');
    const importBtn = document.getElementById('browser-import');
    importBtn.disabled = checked.length === 0;
    importBtn.textContent = checked.length > 0 ? `Import Selected (${checked.length})` : 'Import Selected';
}

async function importSelectedFiles() {
    const checkedItems = document.querySelectorAll('.browser-item input[type="checkbox"]:checked');
    if (checkedItems.length === 0) return;

    const files = window._browserFiles;
    const toImport = [];

    checkedItems.forEach(checkbox => {
        const item = checkbox.closest('.browser-item');
        const index = parseInt(item.dataset.index);
        toImport.push(files[index]);
    });

    closeAllModals();

    // Import each file one by one via upload modal
    for (const file of toImport) {
        await importSingleFile(file);
    }

    await loadScripts();
}

async function importSingleFile(file) {
    return new Promise((resolve) => {
        // Open upload modal with this file pre-selected
        selectedFile = file;
        selectedShow = null;

        fileName.textContent = file.name;
        dropZone.classList.add('hidden');
        fileSelected.classList.remove('hidden');
        metadataForm.classList.remove('hidden');
        selectedShowEl.classList.add('hidden');
        searchResults.classList.add('hidden');

        const suggestedTitle = parseTitle(file.name);
        titleInput.value = suggestedTitle;
        dateInput.value = new Date().toISOString().split('T')[0];

        if (suggestedTitle) {
            searchTMDB(suggestedTitle);
        }

        saveScriptBtn.disabled = true;
        uploadModal.classList.remove('hidden');

        // Wait for modal to close (user saves or cancels)
        const observer = new MutationObserver(() => {
            if (uploadModal.classList.contains('hidden')) {
                observer.disconnect();
                resolve();
            }
        });
        observer.observe(uploadModal, { attributes: true, attributeFilter: ['class'] });
    });
}

// ==========================================
// EDIT SCRIPT
// ==========================================

async function openEditModal() {
    if (!currentScriptId) return;

    const script = await scriptDB.getScript(currentScriptId);
    if (!script) return;

    // Populate edit form
    document.getElementById('edit-title-input').value = script.title;
    document.getElementById('edit-date-input').value = script.dateWorked;

    // Set current show selection
    editSelectedShow = {
        id: script.tmdbId,
        type: script.tmdbType,
        title: script.title,
        year: script.year,
        overview: script.overview,
        posterPath: script.posterUrl ? script.posterUrl.replace(`${TMDB_IMG}/w500`, '') : null
    };

    if (script.posterUrl) {
        document.getElementById('edit-selected-poster').src = script.posterUrl.replace('/w500/', '/w154/');
    }
    document.getElementById('edit-selected-title').textContent = script.title;
    document.getElementById('edit-selected-year').textContent = script.year || '';
    document.getElementById('edit-selected-show').classList.remove('hidden');
    document.getElementById('edit-search-results').classList.add('hidden');

    detailModal.classList.add('hidden');
    editModal.classList.remove('hidden');
}

function handleEditTitleInput() {
    const input = document.getElementById('edit-title-input');
    const resultsEl = document.getElementById('edit-search-results');

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        if (input.value.length >= 2) {
            await searchTMDBForEdit(input.value);
        } else {
            resultsEl.classList.add('hidden');
        }
    }, 300);
}

async function searchTMDBForEdit(query) {
    const apiKey = localStorage.getItem('tmdb_api_key');
    const resultsEl = document.getElementById('edit-search-results');

    if (!apiKey) {
        resultsEl.innerHTML = '<div class="search-result"><p style="padding: 1rem;">Add TMDB API key in settings</p></div>';
        resultsEl.classList.remove('hidden');
        return;
    }

    try {
        const [movieRes, tvRes] = await Promise.all([
            fetch(`${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`),
            fetch(`${TMDB_BASE}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}`)
        ]);

        const movies = await movieRes.json();
        const tvShows = await tvRes.json();

        const results = [
            ...movies.results.slice(0, 5).map(m => ({ ...m, media_type: 'movie' })),
            ...tvShows.results.slice(0, 5).map(t => ({ ...t, media_type: 'tv', title: t.name, release_date: t.first_air_date }))
        ].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 8);

        if (results.length === 0) {
            resultsEl.innerHTML = '<div class="search-result"><p style="padding: 1rem;">No results</p></div>';
        } else {
            resultsEl.innerHTML = results.map(r => `
                <div class="search-result" data-id="${r.id}" data-type="${r.media_type}">
                    <img src="${r.poster_path ? `${TMDB_IMG}/w92${r.poster_path}` : ''}" alt="">
                    <div class="search-result-info">
                        <h4>${r.title || r.name}</h4>
                        <p>${r.release_date ? r.release_date.split('-')[0] : 'Unknown'} • ${r.media_type === 'movie' ? 'Movie' : 'TV'}</p>
                    </div>
                </div>
            `).join('');
        }

        resultsEl.classList.remove('hidden');

        document.querySelectorAll('#edit-search-results .search-result[data-id]').forEach(el => {
            el.addEventListener('click', () => selectShowForEdit(el.dataset.id, el.dataset.type));
        });
    } catch (err) {
        console.error('TMDB search error:', err);
    }
}

async function selectShowForEdit(id, type) {
    const apiKey = localStorage.getItem('tmdb_api_key');
    const endpoint = type === 'movie' ? 'movie' : 'tv';

    try {
        const res = await fetch(`${TMDB_BASE}/${endpoint}/${id}?api_key=${apiKey}`);
        const data = await res.json();

        editSelectedShow = {
            id: data.id,
            type: type,
            title: data.title || data.name,
            year: (data.release_date || data.first_air_date || '').split('-')[0],
            overview: data.overview,
            posterPath: data.poster_path
        };

        document.getElementById('edit-selected-poster').src = editSelectedShow.posterPath
            ? `${TMDB_IMG}/w154${editSelectedShow.posterPath}`
            : '';
        document.getElementById('edit-selected-title').textContent = editSelectedShow.title;
        document.getElementById('edit-selected-year').textContent = editSelectedShow.year;

        document.getElementById('edit-search-results').classList.add('hidden');
        document.getElementById('edit-selected-show').classList.remove('hidden');
    } catch (err) {
        console.error('Error fetching show details:', err);
    }
}

function editChangeSelection() {
    editSelectedShow = null;
    document.getElementById('edit-selected-show').classList.add('hidden');
    document.getElementById('edit-title-input').focus();
}

async function saveEditedScript() {
    if (!currentScriptId || !editSelectedShow) return;

    const dateValue = document.getElementById('edit-date-input').value;
    if (!dateValue) {
        alert('Please enter a date');
        return;
    }

    const updates = {
        title: editSelectedShow.title,
        tmdbId: editSelectedShow.id,
        tmdbType: editSelectedShow.type,
        year: editSelectedShow.year,
        overview: editSelectedShow.overview,
        posterUrl: editSelectedShow.posterPath ? `${TMDB_IMG}/w500${editSelectedShow.posterPath}` : null,
        dateWorked: dateValue
    };

    await scriptDB.updateScript(currentScriptId, updates);
    closeAllModals();
    await loadScripts();
}

// ==========================================
// POSTER ZOOM
// ==========================================

let currentPosterUrl = null;

function openPosterZoom() {
    const detailPoster = document.getElementById('detail-poster');
    if (!detailPoster.src) return;

    // Get high-res version (original size)
    currentPosterUrl = detailPoster.src.replace('/w500/', '/original/');
    document.getElementById('poster-zoom-img').src = currentPosterUrl;
    posterModal.classList.remove('hidden');
}

function closePosterZoom() {
    posterModal.classList.add('hidden');
}

async function downloadPoster() {
    if (!currentPosterUrl) return;

    try {
        const response = await fetch(currentPosterUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const script = await scriptDB.getScript(currentScriptId);
        const filename = script ? `${script.title.replace(/[^a-z0-9]/gi, '_')}_poster.jpg` : 'poster.jpg';

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Error downloading poster:', err);
        alert('Could not download poster. Try right-clicking the image instead.');
    }
}

// ==========================================
// COLLAGE GENERATOR
// ==========================================

let collageCanvas = null;

async function openCollageModal() {
    const scripts = await scriptDB.getAllScripts();
    if (scripts.length === 0) {
        alert('No scripts in your gallery yet. Add some first!');
        return;
    }

    collageModal.classList.remove('hidden');
    await generateCollage();
}

async function generateCollage() {
    const scripts = await scriptDB.getAllScripts();
    const preview = document.getElementById('collage-preview');
    preview.innerHTML = '<p style="text-align: center; padding: 2rem; color: #888;">Loading posters... (0/' + scripts.length + ')</p>';

    const layout = document.getElementById('collage-layout').value;
    const columns = parseInt(document.getElementById('collage-columns').value);
    const titleStyle = document.getElementById('collage-titles').value;

    // Load all poster images with progress
    const posterImages = await loadPosterImagesWithProgress(scripts, (loaded, total) => {
        preview.innerHTML = `<p style="text-align: center; padding: 2rem; color: #888;">Loading posters... (${loaded}/${total})</p>`;
    });

    // Create canvas
    const posterWidth = 300;
    const posterHeight = 450;
    const gap = 20;
    const titleHeight = titleStyle === 'none' ? 0 : (titleStyle === 'title' ? 40 : 60);

    let canvasWidth, canvasHeight, positions;

    if (layout === 'grid') {
        const rows = Math.ceil(scripts.length / columns);
        canvasWidth = columns * posterWidth + (columns + 1) * gap;
        canvasHeight = rows * (posterHeight + titleHeight) + (rows + 1) * gap;
        positions = scripts.map((_, i) => ({
            x: gap + (i % columns) * (posterWidth + gap),
            y: gap + Math.floor(i / columns) * (posterHeight + titleHeight + gap)
        }));
    } else {
        // Timeline horizontal
        canvasWidth = scripts.length * posterWidth + (scripts.length + 1) * gap;
        canvasHeight = posterHeight + titleHeight + gap * 2;
        positions = scripts.map((_, i) => ({
            x: gap + i * (posterWidth + gap),
            y: gap
        }));
    }

    collageCanvas = document.createElement('canvas');
    collageCanvas.width = canvasWidth;
    collageCanvas.height = canvasHeight;
    const ctx = collageCanvas.getContext('2d');

    // Background
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw posters and titles
    for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        const pos = positions[i];
        const img = posterImages[i];

        if (img) {
            ctx.drawImage(img, pos.x, pos.y, posterWidth, posterHeight);
        } else {
            // Placeholder
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(pos.x, pos.y, posterWidth, posterHeight);
            ctx.fillStyle = '#4a4a6a';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No Poster', pos.x + posterWidth / 2, pos.y + posterHeight / 2);
        }

        // Title
        if (titleStyle !== 'none') {
            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            const titleY = pos.y + posterHeight + 25;
            ctx.fillText(truncateText(ctx, script.title, posterWidth - 10), pos.x + posterWidth / 2, titleY);

            if (titleStyle === 'both') {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '13px sans-serif';
                ctx.fillText(formatDate(script.dateWorked), pos.x + posterWidth / 2, titleY + 20);
            }
        }
    }

    preview.innerHTML = '';
    preview.appendChild(collageCanvas);
}

function truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
}

async function loadPosterImagesWithProgress(scripts, onProgress) {
    let loaded = 0;
    const total = scripts.length;

    const results = [];

    for (const script of scripts) {
        let result = null;

        if (script.posterUrl) {
            // Try multiple methods to load the image
            result = await loadImageForCanvas(script.posterUrl);
        }

        loaded++;
        onProgress(loaded, total);
        results.push(result);
    }

    return results;
}

async function loadImageForCanvas(url) {
    // Method 1: Try direct load with CORS
    try {
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = url;
        });
        return img;
    } catch (e) {
        console.log('Direct CORS load failed, trying fetch...', e);
    }

    // Method 2: Try fetch as blob
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error('Fetch failed');
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = objectUrl;
        });
        return img;
    } catch (e) {
        console.log('Fetch blob failed, trying proxy...', e);
    }

    // Method 3: Try with a CORS proxy
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = proxyUrl;
        });
        return img;
    } catch (e) {
        console.log('Proxy load failed', e);
    }

    return null;
}

function downloadCollage() {
    if (!collageCanvas) return;

    const link = document.createElement('a');
    link.download = `moonbeam_collage_${new Date().toISOString().split('T')[0]}.png`;
    link.href = collageCanvas.toDataURL('image/png');
    link.click();
}

// Initialize app
init();
