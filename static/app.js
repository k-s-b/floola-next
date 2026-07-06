// Floola-Next App Logic
let state = {
    tracks: [],
    playlists: [],
    device: {},
    selectedTrackId: null,
    currentPlayingTrackId: null,
    currentCategory: 'all',
    currentPlaylistName: null,
    searchQuery: '',
    sortColumn: null,
    sortDirection: 'asc'
};

// Elements
const tracksListBody = document.getElementById('tracks-list-body');
const playlistListBody = document.getElementById('playlist-list-body');
const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = document.getElementById('play-icon');
const seekSlider = document.getElementById('seek-slider');
const currentTimeLabel = document.getElementById('current-time');
const totalTimeLabel = document.getElementById('total-time');
const currentTrackTitle = document.getElementById('current-track-title');
const currentTrackArtist = document.getElementById('current-track-artist');
const audioPlayer = document.getElementById('audio-preview-player');

const addTrackBtn = document.getElementById('add-track-btn');
const exportTrackBtn = document.getElementById('export-track-btn');
const deleteTrackBtn = document.getElementById('delete-track-btn');
const toolsBtn = document.getElementById('tools-btn');
const searchInput = document.getElementById('search-input');
const trackContextMenu = document.getElementById('track-context-menu');

// Device Stats Info
const deviceModelLabel = document.getElementById('device-model-label');
const tracksCountLabel = document.getElementById('tracks-count-label');
const mountpointLabel = document.getElementById('mountpoint-label');
const storageLabel = document.getElementById('storage-label');
const storageProgressBar = document.getElementById('storage-progress-bar');
const connectionText = document.getElementById('connection-text');
const connectionIndicator = document.querySelector('.status-indicator');

// Audio variables
let audioDuration = 0;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    fetchDevice();
    fetchTracks();
    fetchPlaylists();
    setupEventListeners();
    makeColumnsResizable();
}

// Setup all listeners
function setupEventListeners() {
    // Actions
    addTrackBtn.addEventListener('click', () => showModal('add-music-modal'));
    exportTrackBtn.addEventListener('click', () => {
        if (state.selectedTrackId) downloadTrack(state.selectedTrackId);
    });
    deleteTrackBtn.addEventListener('click', () => {
        if (state.selectedTrackId) confirmDeleteTrack(state.selectedTrackId);
    });

    // Tools Dropdown
    toolsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector('.dropdown-menu').classList.toggle('show');
    });

    document.getElementById('tool-repair').addEventListener('click', (e) => {
        e.preventDefault();
        repairDatabase();
    });

    document.getElementById('tool-redetect').addEventListener('click', (e) => {
        e.preventDefault();
        redetectDevice();
    });

    // Close menus on click away
    document.addEventListener('click', () => {
        document.querySelector('.dropdown-menu').classList.remove('show');
        hideContextMenu();
    });

    // Search
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase();
        renderTracks();
    });

    // Sidebar Category Filter
    document.querySelectorAll('.category-list li').forEach(li => {
        li.addEventListener('click', (e) => {
            document.querySelectorAll('.category-list li').forEach(item => item.classList.remove('active'));
            document.querySelectorAll('.playlist-list li').forEach(item => item.classList.remove('active'));
            li.classList.add('active');
            state.currentCategory = li.dataset.category;
            state.currentPlaylistName = null;
            renderTracks();
        });
    });

    // New Playlist
    document.getElementById('new-playlist-btn').addEventListener('click', () => {
        showModal('playlist-modal');
    });

    document.getElementById('create-playlist-submit').addEventListener('click', createPlaylist);

    // Save Metadata Submit
    document.getElementById('save-metadata-btn').addEventListener('click', saveMetadata);

    // Add Music Submit
    document.getElementById('add-track-submit').addEventListener('click', uploadTrack);

    // Context Menu Listeners
    document.getElementById('menu-edit').addEventListener('click', () => {
        if (state.selectedTrackId) openEditModal(state.selectedTrackId);
    });
    document.getElementById('menu-export').addEventListener('click', () => {
        if (state.selectedTrackId) downloadTrack(state.selectedTrackId);
    });
    document.getElementById('menu-reveal-finder').addEventListener('click', () => {
        if (state.selectedTrackId) revealInFinder(state.selectedTrackId);
    });
    document.getElementById('menu-delete').addEventListener('click', () => {
        if (state.selectedTrackId) confirmDeleteTrack(state.selectedTrackId);
    });

    // Drag and drop zone
    const dropZone = document.getElementById('drop-zone');
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleDroppedFiles(files);
        }
    }, false);

    // Media Player events
    playPauseBtn.addEventListener('click', togglePlay);
    audioPlayer.addEventListener('timeupdate', updateSeekSlider);
    audioPlayer.addEventListener('durationchange', () => {
        audioDuration = audioPlayer.duration;
        seekSlider.max = Math.floor(audioDuration);
        totalTimeLabel.textContent = formatTime(audioDuration);
    });
    audioPlayer.addEventListener('ended', () => {
        playIcon.src = 'icons/play.png';
        playPauseBtn.title = 'Play';
        seekSlider.value = 0;
        currentTimeLabel.textContent = '0:00';
    });

    seekSlider.addEventListener('input', (e) => {
        audioPlayer.currentTime = e.target.value;
    });

    // Player Toggle Init
    const playerToggle = document.getElementById('player-toggle');
    if (playerToggle) {
        playerToggle.checked = localStorage.getItem('useSystemPlayer') === 'true';
        playerToggle.addEventListener('change', () => {
            localStorage.setItem('useSystemPlayer', playerToggle.checked);
        });
    }

    // Column Sorting Headers Listeners
    document.querySelectorAll('.tracks-table th').forEach(th => {
        th.addEventListener('click', (e) => {
            // Prevent sorting click when dragging the column divider resizer
            if (e.target.classList.contains('resizer')) return;
            
            const col = th.dataset.sort;
            if (!col) return;
            
            if (state.sortColumn === col) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortColumn = col;
                state.sortDirection = 'asc';
            }
            
            updateHeaderArrows();
            renderTracks();
        });
    });
}



// API: Fetch Device info
async function fetchDevice() {
    try {
        const response = await fetch('/api/device');
        const data = await response.json();
        state.device = data;
        
        // Render device status
        deviceModelLabel.textContent = data.model;
        tracksCountLabel.textContent = `${data.tracks_count} tracks`;
        mountpointLabel.textContent = `Path: ${data.mountpoint}`;
        
        // Connection text
        if (data.is_virtual) {
            connectionText.textContent = "Virtual Mode";
            connectionIndicator.className = "status-indicator online";
        } else {
            connectionText.textContent = "Connected";
            connectionIndicator.className = "status-indicator online";
        }

        // Storage statistics
        const usedGB = (data.used_space / (1024 ** 3)).toFixed(1);
        const totalGB = (data.total_space / (1024 ** 3)).toFixed(1);
        storageLabel.textContent = `Used: ${usedGB} GB / Total: ${totalGB} GB`;
        
        const usagePercent = ((data.used_space / data.total_space) * 100).toFixed(1);
        storageProgressBar.style.width = `${usagePercent}%`;

        // Apply read-only mode UI restrictions
        if (data.is_read_only) {
            connectionText.textContent = "Safe Read-Only Mode";
            connectionIndicator.className = "status-indicator online";
            
            const addBtn = document.getElementById('add-track-btn');
            const delBtn = document.getElementById('delete-track-btn');
            const newPlBtn = document.getElementById('new-playlist-btn');
            const repairLink = document.getElementById('tool-repair');
            const menuEdit = document.getElementById('menu-edit');
            const menuDel = document.getElementById('menu-delete');
            const menuAddPl = document.getElementById('menu-add-playlist');
            const dropOverlay = document.querySelector('.drop-overlay');
            
            if (addBtn) addBtn.style.display = 'none';
            if (delBtn) delBtn.style.display = 'none';
            if (newPlBtn) newPlBtn.style.display = 'none';
            if (repairLink) repairLink.style.display = 'none';
            if (menuEdit) menuEdit.style.display = 'none';
            if (menuDel) menuDel.style.display = 'none';
            if (menuAddPl) menuAddPl.style.display = 'none';
            if (dropOverlay) dropOverlay.style.display = 'none';
        }
    } catch (e) {
        console.error("Failed to load device info", e);
        connectionText.textContent = "Disconnected";
        connectionIndicator.className = "status-indicator offline";
    }
}

// API: Fetch Tracks list
async function fetchTracks() {
    try {
        const response = await fetch('/api/tracks');
        const data = await response.json();
        state.tracks = data;
        renderTracks();
    } catch (e) {
        console.error("Failed to fetch tracks", e);
        tracksListBody.innerHTML = `<tr><td colspan="8" class="loading-cell" style="color: var(--color-danger)">Error loading iPod database. Make sure environment is running.</td></tr>`;
    }
}

// API: Fetch Playlists
async function fetchPlaylists() {
    try {
        const response = await fetch('/api/playlists');
        const data = await response.json();
        state.playlists = data;
        renderPlaylists();
    } catch (e) {
        console.error("Failed to fetch playlists", e);
    }
}

// Render playlist sidebar
function renderPlaylists() {
    playlistListBody.innerHTML = '';
    
    // Render playlists in context menu and sidebar
    const contextSubmenu = document.getElementById('context-playlist-submenu');
    contextSubmenu.innerHTML = '';

    // Sort playlists alphabetically by name
    const sortedPlaylists = [...state.playlists].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    sortedPlaylists.forEach(pl => {
        // We bypass the Master playlist in user-playlist listing but keep it in backend
        if (pl.is_master) return;
        
        // Sidebar list
        const li = document.createElement('li');
        li.className = 'pl-item';
        if (state.currentPlaylistName === pl.name) li.classList.add('active');
        li.dataset.name = pl.name;
        
        li.innerHTML = `
            <div class="pl-info-wrapper" style="display:flex; align-items:center; gap:12px; cursor:default; flex:1">
                <img src="icons/smartpls.png" alt="Playlist" class="sidebar-icon">
                <span>${pl.name}</span>
            </div>
        `;
        
        // Event for selecting playlist
        li.querySelector('.pl-info-wrapper').addEventListener('click', (e) => {
            document.querySelectorAll('.category-list li').forEach(item => item.classList.remove('active'));
            document.querySelectorAll('.playlist-list li').forEach(item => item.classList.remove('active'));
            li.classList.add('active');
            state.currentPlaylistName = pl.name;
            state.currentCategory = null;
            renderTracks();
        });

        playlistListBody.appendChild(li);

        // Add to Context Submenu list
        const subLi = document.createElement('li');
        subLi.textContent = pl.name;
        subLi.addEventListener('click', () => {
            addTrackToPlaylist(pl.name, state.selectedTrackId);
        });
        contextSubmenu.appendChild(subLi);
    });
}

// Render track list in main grid
function renderTracks() {
    tracksListBody.innerHTML = '';
    
    let filteredTracks = state.tracks;

    // Filter by Category
    if (state.currentCategory) {
        if (state.currentCategory === 'podcasts') {
            // Placeholder: filter podcast tracks (we check name or genre)
            filteredTracks = state.tracks.filter(t => t.genre.toLowerCase() === 'podcast' || t.genre.toLowerCase() === 'system');
        } else if (state.currentCategory === 'videos') {
            // Placeholder: filter videos (ext matching mp4/m4v etc.)
            filteredTracks = state.tracks.filter(t => t.file_path.toLowerCase().endsWith('.mp4') || t.file_path.toLowerCase().endsWith('.m4v'));
        } else if (state.currentCategory === 'photos') {
            filteredTracks = []; // Photos not supported
        }
    }

    // Filter by Playlist
    if (state.currentPlaylistName) {
        const playlist = state.playlists.find(pl => pl.name === state.currentPlaylistName);
        if (playlist) {
            filteredTracks = state.tracks.filter(t => playlist.track_ids.includes(t.id));
        }
    }

    // Search query filter
    if (state.searchQuery) {
        filteredTracks = filteredTracks.filter(t => 
            t.title.toLowerCase().includes(state.searchQuery) ||
            t.artist.toLowerCase().includes(state.searchQuery) ||
            t.album.toLowerCase().includes(state.searchQuery) ||
            t.genre.toLowerCase().includes(state.searchQuery)
        );
    }

    // Sorting
    if (state.sortColumn) {
        filteredTracks.sort((a, b) => {
            let valA = a[state.sortColumn];
            let valB = b[state.sortColumn];
            
            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = (valB || '').toLowerCase();
                return state.sortDirection === 'asc' 
                    ? valA.localeCompare(valB) 
                    : valB.localeCompare(valA);
            }
            
            valA = valA || 0;
            valB = valB || 0;
            return state.sortDirection === 'asc' 
                ? valA - valB 
                : valB - valA;
        });
    }

    if (filteredTracks.length === 0) {
        tracksListBody.innerHTML = `<tr><td colspan="7" class="loading-cell">No tracks found matching current selection.</td></tr>`;
        return;
    }

    filteredTracks.forEach((track, index) => {
        const tr = document.createElement('tr');
        tr.dataset.id = track.id;
        
        if (state.selectedTrackId === track.id) tr.classList.add('selected');
        if (state.currentPlayingTrackId === track.id) tr.classList.add('playing');

        // Format duration
        const mins = Math.floor(track.duration / 60);
        const secs = String(track.duration % 60).padStart(2, '0');
        const durationStr = `${mins}:${secs}`;

        // Star rating
        let starsStr = '';
        for (let i = 1; i <= 5; i++) {
            starsStr += i <= track.rating ? '★' : '☆';
        }

        tr.innerHTML = `
            <td class="track-title" title="${track.title}">${track.title}</td>
            <td title="${track.artist}">${track.artist}</td>
            <td title="${track.album}">${track.album}</td>
            <td>${track.genre}</td>
            <td>${durationStr}</td>
            <td style="color: #fbbf24; font-size: 0.95rem;">${starsStr}</td>
            <td>${track.play_count}</td>
        `;

        // Selection
        tr.addEventListener('click', (e) => {
            e.stopPropagation();
            selectTrack(track.id);
        });

        // Double click to play
        tr.addEventListener('dblclick', () => {
            const toggle = document.getElementById('player-toggle');
            if (toggle && toggle.checked) {
                playSystemTrack(track.id);
            } else {
                playTrack(track.id);
            }
        });

        // Right click Context Menu
        tr.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectTrack(track.id);
            showContextMenu(e.clientX, e.clientY);
        });

        tracksListBody.appendChild(tr);
    });
}

function selectTrack(trackId) {
    state.selectedTrackId = trackId;
    
    // Highlight in Table
    document.querySelectorAll('.tracks-table tbody tr').forEach(row => {
        if (parseInt(row.dataset.id) === trackId) {
            row.classList.add('selected');
        } else {
            row.classList.remove('selected');
        }
    });

    // Enable toolbar buttons
    exportTrackBtn.removeAttribute('disabled');
    deleteTrackBtn.removeAttribute('disabled');
}

// Media Player: Play Track in System Player
async function playSystemTrack(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;

    state.currentPlayingTrackId = trackId;

    // Highlight playing track
    document.querySelectorAll('.tracks-table tbody tr').forEach(row => {
        if (parseInt(row.dataset.id) === trackId) {
            row.classList.add('playing');
        } else {
            row.classList.remove('playing');
        }
    });

    currentTrackTitle.textContent = track.title;
    currentTrackArtist.textContent = track.artist + " (System Player)";

    // Clear and pause local web player
    audioPlayer.pause();
    audioPlayer.src = '';
    playIcon.src = 'icons/play.png';
    playPauseBtn.title = 'Play';
    seekSlider.value = 0;
    seekSlider.disabled = true;
    currentTimeLabel.textContent = '0:00';
    totalTimeLabel.textContent = '0:00';

    try {
        await fetch(`/api/tracks/play-system/${trackId}`, { method: 'POST' });
    } catch (e) {
        console.error("Error playing in system player", e);
    }
}

// Media Player: Load and Play Track
function playTrack(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;

    state.currentPlayingTrackId = trackId;
    
    // Highlight playing track
    document.querySelectorAll('.tracks-table tbody tr').forEach(row => {
        if (parseInt(row.dataset.id) === trackId) {
            row.classList.add('playing');
        } else {
            row.classList.remove('playing');
        }
    });

    // Set playing details
    currentTrackTitle.textContent = track.title;
    currentTrackArtist.textContent = track.artist;

    // Load audio preview player src
    audioPlayer.src = `/api/tracks/play/${trackId}`;
    audioPlayer.play()
        .then(() => {
            playIcon.src = 'icons/pause.png';
            playPauseBtn.title = 'Pause';
            seekSlider.removeAttribute('disabled');
        })
        .catch(err => {
            console.error("Playback failed or track missing on virtual iPod", err);
            currentTrackTitle.textContent = "Error: Track not found";
            currentTrackArtist.textContent = "Make sure the file exists on the iPod partition";
            playIcon.src = 'icons/play.png';
        });
}

// Play/Pause Toggle
function togglePlay() {
    if (!state.currentPlayingTrackId) return;

    if (audioPlayer.paused) {
        audioPlayer.play();
        playIcon.src = 'icons/pause.png';
        playPauseBtn.title = 'Pause';
    } else {
        audioPlayer.pause();
        playIcon.src = 'icons/play.png';
        playPauseBtn.title = 'Play';
    }
}

// Seek bar updates
function updateSeekSlider() {
    seekSlider.value = Math.floor(audioPlayer.currentTime);
    currentTimeLabel.textContent = formatTime(audioPlayer.currentTime);
}

// Helpers
function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = String(Math.floor(seconds % 60)).padStart(2, '0');
    return `${mins}:${secs}`;
}

// Context Menu visibility
function showContextMenu(x, y) {
    trackContextMenu.style.display = 'block';
    
    // Populate "Show in Playlist" submenu
    const showPlMenu = document.getElementById('menu-show-playlist');
    const showPlSubmenu = document.getElementById('context-show-playlist-submenu');
    showPlSubmenu.innerHTML = '';
    
    const containingPlaylists = state.playlists.filter(pl => !pl.is_master && pl.track_ids.includes(state.selectedTrackId));
    
    if (containingPlaylists.length === 0) {
        showPlMenu.style.display = 'none';
    } else {
        showPlMenu.style.display = 'block';
        // Sort containing playlists alphabetically
        const sortedContainingPlaylists = [...containingPlaylists].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        
        sortedContainingPlaylists.forEach(pl => {
            const li = document.createElement('li');
            li.textContent = pl.name;
            li.addEventListener('click', () => {
                state.currentPlaylistName = pl.name;
                state.currentCategory = null;
                
                // Update sidebar UI active state
                document.querySelectorAll('.category-list li').forEach(item => item.classList.remove('active'));
                document.querySelectorAll('.playlist-list li').forEach(item => {
                    if (item.dataset.name === pl.name) {
                        item.classList.add('active');
                    } else {
                        item.classList.remove('active');
                    }
                });
                
                renderTracks();
                
                // Highlight and scroll to track
                setTimeout(() => {
                    const row = document.querySelector(`.tracks-table tbody tr[data-id="${state.selectedTrackId}"]`);
                    if (row) {
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        row.classList.add('selected');
                    }
                }, 100);
            });
            showPlSubmenu.appendChild(li);
        });
    }

    // Ensure menu doesn't go offscreen
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const menuWidth = trackContextMenu.offsetWidth;
    const menuHeight = trackContextMenu.offsetHeight;

    let left = x;
    let top = y;

    if (x + menuWidth > winWidth) {
        left = winWidth - menuWidth - 10;
    }
    if (y + menuHeight > winHeight) {
        top = winHeight - menuHeight - 10;
    }

    trackContextMenu.style.left = `${left}px`;
    trackContextMenu.style.top = `${top}px`;
}

function hideContextMenu() {
    trackContextMenu.style.display = 'none';
}

// Modals display
function showModal(id) {
    document.getElementById(id).classList.add('show');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

// API operations: Edit metadata
function openEditModal(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;

    document.getElementById('edit-track-id').value = trackId;
    document.getElementById('edit-title').value = track.title;
    document.getElementById('edit-artist').value = track.artist;
    document.getElementById('edit-album').value = track.album;
    document.getElementById('edit-genre').value = track.genre;
    document.getElementById('edit-year').value = track.year || '';
    document.getElementById('edit-track-number').value = track.track_number || '';
    document.getElementById('edit-rating').value = track.rating;

    showModal('metadata-modal');
}

async function saveMetadata() {
    const trackId = document.getElementById('edit-track-id').value;
    
    const data = {
        title: document.getElementById('edit-title').value,
        artist: document.getElementById('edit-artist').value,
        album: document.getElementById('edit-album').value,
        genre: document.getElementById('edit-genre').value,
        year: document.getElementById('edit-year').value,
        track_number: document.getElementById('edit-track-number').value,
        rating: document.getElementById('edit-rating').value
    };

    try {
        const response = await fetch(`/api/tracks/update/${trackId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const res = await response.json();
        if (res.success) {
            closeModal('metadata-modal');
            fetchTracks();
        } else {
            alert("Error saving metadata settings.");
        }
    } catch(e) {
        console.error(e);
    }
}

// API: Add music track
async function uploadTrack() {
    const fileInput = document.getElementById('add-file-input');
    if (fileInput.files.length === 0) {
        alert("Please select a file.");
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', document.getElementById('add-title').value);
    formData.append('artist', document.getElementById('add-artist').value);
    formData.append('album', document.getElementById('add-album').value);
    formData.append('genre', document.getElementById('add-genre').value);
    formData.append('year', document.getElementById('add-year').value);
    formData.append('track_number', document.getElementById('add-track-number').value);
    formData.append('rating', document.getElementById('add-rating').value);

    // Show a uploading message
    document.getElementById('add-track-submit').textContent = "Adding...";
    document.getElementById('add-track-submit').setAttribute('disabled', 'true');

    try {
        const response = await fetch('/api/tracks/add', {
            method: 'POST',
            body: formData
        });
        const res = await response.json();
        if (res.success) {
            closeModal('add-music-modal');
            document.getElementById('add-music-form').reset();
            fetchTracks();
            fetchDevice();
        } else {
            alert("Upload failed: " + res.error);
        }
    } catch (e) {
        console.error(e);
    } finally {
        document.getElementById('add-track-submit').textContent = "Upload to iPod";
        document.getElementById('add-track-submit').removeAttribute('disabled');
    }
}

// Drag and drop handler
async function handleDroppedFiles(files) {
    // Loop and add the files sequentially
    for (let file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch('/api/tracks/add', {
                method: 'POST',
                body: formData
            });
            const res = await response.json();
            if (!res.success) {
                console.error(`Failed to add dropped file: ${file.name}`);
            }
        } catch (e) {
            console.error(e);
        }
    }
    fetchTracks();
    fetchDevice();
}

// Download/Export track
function downloadTrack(trackId) {
    window.location.href = `/api/tracks/export/${trackId}`;
}

// Reveal track in Finder
async function revealInFinder(trackId) {
    try {
        const response = await fetch(`/api/tracks/reveal/${trackId}`, {
            method: 'POST'
        });
        const res = await response.json();
        if (!res.success) {
            alert("Failed to reveal file: " + res.error);
        }
    } catch (e) {
        console.error("Error revealing in Finder", e);
    }
}

// Confirm Delete Track
function confirmDeleteTrack(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return;

    if (confirm(`Are you sure you want to permanently delete "${track.title}" from your iPod? This deletes the file.`)) {
        deleteTrack(trackId);
    }
}

async function deleteTrack(trackId) {
    try {
        const response = await fetch(`/api/tracks/${trackId}`, {
            method: 'DELETE'
        });
        const res = await response.json();
        if (res.success) {
            state.selectedTrackId = null;
            exportTrackBtn.setAttribute('disabled', 'true');
            deleteTrackBtn.setAttribute('disabled', 'true');
            
            // If deleting playing track, stop player
            if (state.currentPlayingTrackId === trackId) {
                audioPlayer.pause();
                state.currentPlayingTrackId = null;
                currentTrackTitle.textContent = "No track loaded";
                currentTrackArtist.textContent = "";
                playIcon.src = 'icons/play.png';
            }
            
            fetchTracks();
            fetchDevice();
        } else {
            alert("Delete failed.");
        }
    } catch (e) {
        console.error(e);
    }
}

// Create Playlist
async function createPlaylist() {
    const nameInput = document.getElementById('playlist-name-input');
    const name = nameInput.value.trim();
    if (!name) return;

    try {
        const response = await fetch('/api/playlists/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const res = await response.json();
        if (res.success) {
            nameInput.value = '';
            closeModal('playlist-modal');
            fetchPlaylists();
        } else {
            alert("Failed to create playlist.");
        }
    } catch (e) {
        console.error(e);
    }
}

// Delete Playlist
function confirmDeletePlaylist(name) {
    if (confirm(`Are you sure you want to delete playlist "${name}"? This will not delete the music files.`)) {
        deletePlaylist(name);
    }
}

async function deletePlaylist(name) {
    try {
        const response = await fetch(`/api/playlists/${name}`, {
            method: 'DELETE'
        });
        const res = await response.json();
        if (res.success) {
            if (state.currentPlaylistName === name) {
                state.currentPlaylistName = null;
                state.currentCategory = 'all';
                document.querySelector('.category-list li[data-category="all"]').classList.add('active');
            }
            fetchPlaylists();
            renderTracks();
        } else {
            alert("Failed to delete playlist.");
        }
    } catch (e) {
        console.error(e);
    }
}

// Add Track to Playlist
async function addTrackToPlaylist(playlistName, trackId) {
    try {
        const response = await fetch(`/api/playlists/${playlistName}/add/${trackId}`, {
            method: 'POST'
        });
        const res = await response.json();
        if (res.success) {
            fetchPlaylists();
            alert(`Added track to playlist "${playlistName}"`);
        } else {
            alert("Failed to add to playlist.");
        }
    } catch (e) {
        console.error(e);
    }
}

// Database Repair check
async function repairDatabase() {
    try {
        const response = await fetch('/api/device/repair', {
            method: 'POST'
        });
        const res = await response.json();
        if (res.success) {
            alert("iPod database checksums and hashes updated successfully!");
        } else {
            alert("Failed to update database checksums.");
        }
    } catch (e) {
        console.error(e);
    }
}

// Redetect device
async function redetectDevice() {
    try {
        const response = await fetch('/api/device/redetect', {
            method: 'POST'
        });
        const res = await response.json();
        if (res.success) {
            initApp();
            alert(`iPod redetected: ${res.device.model} loaded at ${res.mountpoint}`);
        } else {
            alert("No iPod detected.");
        }
    } catch (e) {
        console.error(e);
    }
}

// Update column sorting header arrows
function updateHeaderArrows() {
    document.querySelectorAll('.tracks-table th').forEach(th => {
        const col = th.dataset.sort;
        if (!col) return;
        
        let textSpan = th.querySelector('.th-text');
        if (!textSpan) {
            textSpan = document.createElement('span');
            textSpan.classList.add('th-text');
            const childNodes = Array.from(th.childNodes);
            childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    textSpan.appendChild(node);
                }
            });
            th.insertBefore(textSpan, th.firstChild);
        }
        
        let text = textSpan.textContent.replace(/ [▲▼]/g, '');
        if (state.sortColumn === col) {
            text += state.sortDirection === 'asc' ? ' ▲' : ' ▼';
        }
        textSpan.textContent = text;
    });
}

// Make table columns resizable by dragging
function makeColumnsResizable() {
    const table = document.querySelector('.tracks-table');
    if (!table) return;
    
    const headers = table.querySelectorAll('th');
    headers.forEach((header) => {
        if (header.querySelector('.resizer')) return;
        
        const resizer = document.createElement('div');
        resizer.classList.add('resizer');
        header.appendChild(resizer);
        
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const startX = e.clientX;
            const startWidth = header.offsetWidth;
            
            const onMouseMove = (moveEvent) => {
                const newWidth = startWidth + (moveEvent.clientX - startX);
                if (newWidth > 50) { // minimum column width
                    header.style.width = `${newWidth}px`;
                }
            };
            
            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                header.classList.remove('th-resizing');
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            header.classList.add('th-resizing');
        });
    });
}
