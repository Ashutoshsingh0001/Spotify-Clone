/**
 * Spotify Web Player - Real-Time Client Application
 * Features:
 * - Real HTTP 206 streaming audio playback (Play, Pause, Scrub/Seek, Next, Prev, Volume, Shuffle, Repeat)
 * - Real-Time WebSockets (Socket.io) Synchronized Group Sessions (Spotify Jam)
 * - Real-Time Friend Activity presence feed
 * - Dynamic REST API catalog (Recently Played, Trending, Featured)
 * - Real-Time Search & Autocomplete
 * - Real-Time Playlist Creation & Liked Songs sync
 * - Floating reactions and Live Party Chat
 */

// --- STATE MANAGEMENT ---
let songs = [];
let currentIndex = 0;
let isPlaying = false;
let isShuffle = false;
let isRepeat = false;
let likedSongIds = new Set();
let playlists = [];
let myProfile = { username: 'Guest', avatarColor: '#1db954' };
let currentJamRoom = null;
let isJamSyncing = false; // prevents recursive loop when applying remote sync
let friendActivityOpen = false;

// Audio Element
const audio = new Audio();
audio.preload = 'auto';

// Socket.io Connection
const socket = io();

// --- DOM ELEMENTS ---
const playBtn = document.getElementById('play-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const shuffleBtn = document.getElementById('shuffle-btn');
const repeatBtn = document.getElementById('repeat-btn');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const volumeSlider = document.getElementById('volume-slider');
const volumeIcon = document.getElementById('volume-icon');
const playerAlbumImg = document.getElementById('player-album-img');
const playerSongName = document.getElementById('player-song-name');
const playerArtistName = document.getElementById('player-artist-name');
const playerLikeBtn = document.getElementById('player-like-btn');
const searchInput = document.getElementById('search-input');
const searchContainer = document.getElementById('search-container');
const homeContent = document.getElementById('home-content');
const searchView = document.getElementById('search-view');
const searchResultsGrid = document.getElementById('search-results-grid');
const navHomeBtn = document.getElementById('nav-home');
const navSearchBtn = document.getElementById('nav-search');
const liveStatsBadge = document.getElementById('live-stats-badge');
const jamBtn = document.getElementById('jam-btn');
const jamModal = document.getElementById('jam-modal');
const jamModalClose = document.getElementById('jam-modal-close');
const friendActivityDrawer = document.getElementById('friend-activity-drawer');
const friendToggleBtn = document.getElementById('friend-toggle-btn');
const friendListEl = document.getElementById('friend-list');
const playlistContainer = document.getElementById('playlist-container');
const createPlaylistBtn = document.getElementById('create-playlist-btn');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    initAudio();
    initEventListeners();
    initSocketEvents();
    await loadInitialData();
});

// --- AUDIO ENGINE ---
function initAudio() {
    audio.volume = 0.8;
    if (volumeSlider) volumeSlider.value = 80;

    // Time update for progress bar and labels
    audio.addEventListener('timeupdate', () => {
        if (!audio.duration || isNaN(audio.duration)) return;
        const current = audio.currentTime;
        const total = audio.duration;
        const progressPercent = (current / total) * 100;
        
        if (progressBar && !progressBar.matches(':active')) {
            progressBar.value = progressPercent;
        }
        if (currentTimeEl) currentTimeEl.textContent = formatTime(current);

        // Periodically report activity (every ~4 sec) to friends
        if (isPlaying && Math.floor(current) % 4 === 0) {
            broadcastActivity();
        }
    });

    audio.addEventListener('loadedmetadata', () => {
        if (totalTimeEl && !isNaN(audio.duration)) {
            totalTimeEl.textContent = formatTime(audio.duration);
        }
    });

    audio.addEventListener('play', () => {
        isPlaying = true;
        updatePlayButtonUI(true);
        updateActiveCardUI();
        broadcastActivity();
    });

    audio.addEventListener('pause', () => {
        isPlaying = false;
        updatePlayButtonUI(false);
        updateActiveCardUI();
        broadcastActivity();
    });

    audio.addEventListener('ended', () => {
        if (isRepeat) {
            audio.currentTime = 0;
            audio.play();
        } else {
            playNext(true);
        }
    });

    audio.addEventListener('error', (e) => {
        console.warn('Audio playback notice:', e);
    });
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// --- CORE PLAYBACK CONTROLS ---

function loadAndPlay(index, startAt = 0, isLocalAction = true) {
    if (!songs || songs.length === 0) return;
    if (index < 0) index = songs.length - 1;
    if (index >= songs.length) index = 0;

    currentIndex = index;
    const song = songs[currentIndex];
    if (!song) return;

    // Update bottom player bar info
    if (playerAlbumImg) playerAlbumImg.src = song.cover;
    if (playerSongName) playerSongName.textContent = song.title;
    if (playerArtistName) playerArtistName.textContent = song.artist;
    updateLikeButtonUI(song.id);

    // Stream URL with HTTP 206 Range support
    const streamUrl = `/api/stream/${song.id}`;
    if (audio.src !== window.location.origin + streamUrl) {
        audio.src = streamUrl;
    }

    if (startAt > 0) {
        audio.currentTime = startAt;
    }

    audio.play().then(() => {
        isPlaying = true;
        updatePlayButtonUI(true);
        updateActiveCardUI();
        
        // Sync to Jam Room if active
        if (isLocalAction && currentJamRoom && !isJamSyncing) {
            socket.emit('jam:sync_playback', {
                action: 'play',
                currentTime: audio.currentTime,
                songId: song.id
            });
        }
    }).catch(err => {
        console.log('Autoplay restriction or waiting for user interaction:', err);
    });
}

function togglePlayPause(isLocalAction = true) {
    if (!songs || songs.length === 0) return;

    if (!audio.src || audio.src === '') {
        loadAndPlay(currentIndex, 0, isLocalAction);
        return;
    }

    if (audio.paused) {
        audio.play().then(() => {
            isPlaying = true;
            updatePlayButtonUI(true);
            updateActiveCardUI();
            if (isLocalAction && currentJamRoom && !isJamSyncing) {
                socket.emit('jam:sync_playback', {
                    action: 'play',
                    currentTime: audio.currentTime,
                    songId: songs[currentIndex]?.id
                });
            }
        });
    } else {
        audio.pause();
        isPlaying = false;
        updatePlayButtonUI(false);
        updateActiveCardUI();
        if (isLocalAction && currentJamRoom && !isJamSyncing) {
            socket.emit('jam:sync_playback', {
                action: 'pause',
                currentTime: audio.currentTime,
                songId: songs[currentIndex]?.id
            });
        }
    }
}

function playNext(isLocalAction = true) {
    let nextIdx = currentIndex + 1;
    if (isShuffle) {
        nextIdx = Math.floor(Math.random() * songs.length);
    }
    loadAndPlay(nextIdx, 0, isLocalAction);
}

function playPrev(isLocalAction = true) {
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        if (currentJamRoom && isLocalAction && !isJamSyncing) {
            socket.emit('jam:sync_playback', { action: 'seek', currentTime: 0 });
        }
        return;
    }
    let prevIdx = currentIndex - 1;
    if (prevIdx < 0) prevIdx = songs.length - 1;
    loadAndPlay(prevIdx, 0, isLocalAction);
}

function seekTo(percent, isLocalAction = true) {
    if (!audio.duration || isNaN(audio.duration)) return;
    const targetTime = (percent / 100) * audio.duration;
    audio.currentTime = targetTime;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(targetTime);

    if (isLocalAction && currentJamRoom && !isJamSyncing) {
        socket.emit('jam:sync_playback', {
            action: 'seek',
            currentTime: targetTime,
            songId: songs[currentIndex]?.id
        });
    }
}

// --- UI UPDATERS ---

function updatePlayButtonUI(playing) {
    if (!playBtn) return;
    if (playing) {
        playBtn.src = './assests/play_musicbar.png';
        playBtn.classList.add('playing-pulse');
        playBtn.title = "Pause (Space)";
    } else {
        playBtn.src = './assests/player_icon3.png';
        playBtn.classList.remove('playing-pulse');
        playBtn.title = "Play (Space)";
    }
}

function updateActiveCardUI() {
    const currentSong = songs[currentIndex];
    if (!currentSong) return;

    document.querySelectorAll('.card').forEach(card => {
        const id = parseInt(card.dataset.songId, 10);
        if (id === currentSong.id) {
            card.classList.add('card-playing');
            const playOverlay = card.querySelector('.card-play-btn i');
            if (playOverlay) {
                playOverlay.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
            }
        } else {
            card.classList.remove('card-playing');
            const playOverlay = card.querySelector('.card-play-btn i');
            if (playOverlay) {
                playOverlay.className = 'fa-solid fa-play';
            }
        }
    });
}

function updateLikeButtonUI(songId) {
    if (!playerLikeBtn) return;
    const isLiked = likedSongIds.has(songId);
    if (isLiked) {
        playerLikeBtn.className = 'fa-solid fa-heart liked';
        playerLikeBtn.style.color = '#1db954';
    } else {
        playerLikeBtn.className = 'fa-regular fa-heart';
        playerLikeBtn.style.color = '#b3b3b3';
    }
}

// --- DATA FETCHING & RENDERING ---

async function loadInitialData() {
    try {
        // 1. Fetch Songs
        const songsRes = await fetch('/api/songs');
        songs = await songsRes.json();
        
        // 2. Fetch Likes
        const likesRes = await fetch('/api/likes');
        const likes = await likesRes.json();
        likedSongIds = new Set(likes);

        // 3. Fetch Playlists
        const playlistsRes = await fetch('/api/playlists');
        playlists = await playlistsRes.json();

        // Render Home Cards
        renderHomeSections();
        renderPlaylists();

        // Set initial player bar display with 1st song
        if (songs.length > 0) {
            const first = songs[0];
            if (playerAlbumImg) playerAlbumImg.src = first.cover;
            if (playerSongName) playerSongName.textContent = first.title;
            if (playerArtistName) playerArtistName.textContent = first.artist;
            if (totalTimeEl) totalTimeEl.textContent = formatTime(first.duration);
            updateLikeButtonUI(first.id);
        }
    } catch (err) {
        console.error('Failed to load initial data:', err);
    }
}

function renderHomeSections() {
    const recentlyPlayed = songs.filter(s => s.category === 'recently-played');
    const trending = songs.filter(s => s.category === 'trending');
    const featured = songs.filter(s => s.category === 'featured');

    const recentContainer = document.getElementById('recent-container');
    const trendingContainer = document.getElementById('trending-container');
    const featuredContainer = document.getElementById('featured-container');

    if (recentContainer) recentContainer.innerHTML = recentlyPlayed.map(createCardHTML).join('');
    if (trendingContainer) trendingContainer.innerHTML = trending.map(createCardHTML).join('');
    if (featuredContainer) featuredContainer.innerHTML = featured.map(createCardHTML).join('');

    attachCardClickHandlers();
}

function createCardHTML(song) {
    const isCur = songs[currentIndex]?.id === song.id;
    return `
        <div class="card ${isCur ? 'card-playing' : ''}" data-song-id="${song.id}">
            <div class="card-img-wrapper">
                <img src="${song.cover}" class="card-img" alt="${song.title}">
                <button class="card-play-btn" title="Play ${song.title}">
                    <i class="${isCur && isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'}"></i>
                </button>
                <div class="sound-wave-bars">
                    <span></span><span></span><span></span><span></span>
                </div>
            </div>
            <p class="card-title">${song.title}</p>
            <p class="card-info">${song.artist}</p>
        </div>
    `;
}

function attachCardClickHandlers() {
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', (e) => {
            const songId = parseInt(card.dataset.songId, 10);
            const songIdx = songs.findIndex(s => s.id === songId);
            if (songIdx === -1) return;

            if (songIdx === currentIndex) {
                togglePlayPause(true);
            } else {
                loadAndPlay(songIdx, 0, true);
            }
        });
    });
}

function renderPlaylists() {
    if (!playlistContainer) return;
    playlistContainer.innerHTML = playlists.map(p => `
        <div class="playlist-item" data-playlist-id="${p.id}">
            <i class="fa-solid fa-music"></i>
            <div class="playlist-info">
                <span class="playlist-title">${p.title}</span>
                <span class="playlist-count">${p.trackIds ? p.trackIds.length : (p.tracks ? p.tracks.length : 0)} songs</span>
            </div>
        </div>
    `).join('');

    // Clicking a playlist plays its songs
    document.querySelectorAll('.playlist-item').forEach(item => {
        item.addEventListener('click', () => {
            const pid = item.dataset.playlistId;
            const p = playlists.find(x => x.id === pid);
            if (p && p.trackIds && p.trackIds.length > 0) {
                const firstSongId = p.trackIds[0];
                const sIdx = songs.findIndex(s => s.id === firstSongId);
                if (sIdx !== -1) loadAndPlay(sIdx, 0, true);
            }
        });
    });
}

// --- REAL-TIME SEARCH ---

let searchDebounceTimeout = null;
function handleSearch(query) {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const results = await res.json();
            renderSearchResults(results, query);
        } catch (err) {
            console.error('Search error:', err);
        }
    }, 200);
}

function renderSearchResults(results, query) {
    if (!searchResultsGrid) return;
    if (results.length === 0) {
        searchResultsGrid.innerHTML = `
            <div class="no-results">
                <i class="fa-solid fa-magnifying-glass" style="font-size: 3rem; opacity: 0.4; margin-bottom: 1rem;"></i>
                <h3>No results found for "${query}"</h3>
                <p>Please check your spelling or search for another artist or song.</p>
            </div>
        `;
        return;
    }

    searchResultsGrid.innerHTML = results.map(createCardHTML).join('');
    attachCardClickHandlers();
}

// --- REAL-TIME WEBSOCKET LISTENERS ---

function initSocketEvents() {
    // 1. Initial Profile
    socket.on('profile:init', (profile) => {
        myProfile = profile;
        const profileEl = document.getElementById('user-profile-badge');
        if (profileEl) {
            profileEl.innerHTML = `<span class="user-avatar-dot" style="background:${profile.avatarColor}"></span> ${profile.username}`;
        }
    });

    // 2. Real-Time Stats (Online count, streams, active rooms)
    socket.on('stats:update', (stats) => {
        if (liveStatsBadge) {
            liveStatsBadge.innerHTML = `
                <span class="live-pulse"></span>
                <span>${stats.onlineUsers} Online</span>
                <span class="stats-sep">•</span>
                <span>${stats.activeRooms} Jam Rooms</span>
            `;
        }
    });

    // 3. Real-Time Friend Activity Feed
    socket.on('presence:list', (users) => {
        renderFriendActivity(users);
    });

    // 4. Real-Time Jam Room Events
    socket.on('jam:created', (room) => {
        currentJamRoom = room;
        updateJamModalUI();
        showToast(`🎉 Jam Room created! Code: ${room.code}`);
    });

    socket.on('jam:joined', (room) => {
        currentJamRoom = room;
        updateJamModalUI();
        showToast(`🎧 Joined ${room.name}!`);

        // Synchronize local player with room playback
        if (room.currentSong) {
            const songIdx = songs.findIndex(s => s.id === room.currentSong.id);
            if (songIdx !== -1) {
                isJamSyncing = true;
                currentIndex = songIdx;
                const streamUrl = `/api/stream/${room.currentSong.id}`;
                audio.src = streamUrl;
                audio.currentTime = room.playbackTime || 0;
                
                if (room.isPlaying) {
                    audio.play().catch(e => console.log('Autoplay policy caught:', e));
                    updatePlayButtonUI(true);
                } else {
                    audio.pause();
                    updatePlayButtonUI(false);
                }
                updateActiveCardUI();
                setTimeout(() => { isJamSyncing = false; }, 300);
            }
        }
    });

    socket.on('jam:state_changed', (state) => {
        if (!currentJamRoom) return;
        currentJamRoom.isPlaying = state.isPlaying;
        currentJamRoom.currentSong = state.currentSong;
        currentJamRoom.playbackTime = state.playbackTime;

        isJamSyncing = true;

        if (state.currentSong) {
            const songIdx = songs.findIndex(s => s.id === state.currentSong.id);
            if (songIdx !== -1 && currentIndex !== songIdx) {
                currentIndex = songIdx;
                audio.src = `/api/stream/${state.currentSong.id}`;
                if (playerAlbumImg) playerAlbumImg.src = state.currentSong.cover;
                if (playerSongName) playerSongName.textContent = state.currentSong.title;
                if (playerArtistName) playerArtistName.textContent = state.currentSong.artist;
            }
        }

        if (typeof state.playbackTime === 'number' && Math.abs(audio.currentTime - state.playbackTime) > 1.5) {
            audio.currentTime = state.playbackTime;
        }

        if (state.action === 'play') {
            audio.play().catch(e => console.log(e));
            updatePlayButtonUI(true);
        } else if (state.action === 'pause') {
            audio.pause();
            updatePlayButtonUI(false);
        }

        updateActiveCardUI();
        updateJamModalUI();
        setTimeout(() => { isJamSyncing = false; }, 300);
    });

    socket.on('jam:member_joined', ({ user, memberCount, members }) => {
        if (currentJamRoom) {
            currentJamRoom.members = members;
            updateJamModalUI();
        }
        showToast(`👋 ${user.username} joined the Jam!`);
    });

    socket.on('jam:member_left', ({ members }) => {
        if (currentJamRoom) {
            currentJamRoom.members = members;
            updateJamModalUI();
        }
    });

    // Real-Time Floating Reactions (Party Emojis!)
    socket.on('jam:reaction_broadcast', ({ emoji, fromUser, color }) => {
        triggerFloatingReaction(emoji, fromUser, color);
    });

    // Real-Time Jam Chat Message
    socket.on('jam:new_message', (msg) => {
        appendJamChatMessage(msg);
    });

    socket.on('jam:error', (err) => {
        alert(err.message || 'Jam Room Error');
    });

    // Likes updated from server or another tab
    socket.on('likes:updated', (likes) => {
        likedSongIds = new Set(likes);
        if (songs[currentIndex]) updateLikeButtonUI(songs[currentIndex].id);
    });

    // Playlists updated
    socket.on('playlists:updated', (newPlaylists) => {
        playlists = newPlaylists;
        renderPlaylists();
    });
}

function broadcastActivity() {
    if (!songs || songs.length === 0) return;
    socket.emit('activity:playing', {
        song: songs[currentIndex] || null,
        isPlaying: isPlaying,
        currentTime: audio.currentTime
    });
}

function renderFriendActivity(users) {
    if (!friendListEl) return;
    const others = users.filter(u => u.id !== socket.id);
    
    if (others.length === 0) {
        friendListEl.innerHTML = `
            <div class="empty-friends">
                <i class="fa-solid fa-users" style="font-size: 2rem; opacity: 0.4; margin-bottom: 0.5rem;"></i>
                <p>No other friends online right now.</p>
                <small>Open this page in an incognito or second tab to test real-time collaboration!</small>
            </div>
        `;
        return;
    }

    friendListEl.innerHTML = others.map(u => `
        <div class="friend-item">
            <div class="friend-avatar" style="background:${u.avatarColor || '#1db954'}">
                ${u.username ? u.username[0].toUpperCase() : 'U'}
                <span class="online-indicator"></span>
            </div>
            <div class="friend-info">
                <div class="friend-name">${u.username}</div>
                <div class="friend-track">
                    ${u.currentSong ? `
                        <i class="fa-solid ${u.isPlaying ? 'fa-volume-high live-equalizer-icon' : 'fa-pause'}" style="color: #1db954;"></i>
                        <span>${u.currentSong.title} • ${u.currentSong.artist}</span>
                    ` : '<span class="idle-text">Listening to quiet vibes</span>'}
                </div>
            </div>
        </div>
    `).join('');
}

// --- JAM ROOM UI & REACTIONS ---

function updateJamModalUI() {
    const activeSection = document.getElementById('jam-active-section');
    const inactiveSection = document.getElementById('jam-inactive-section');
    const roomCodeDisplay = document.getElementById('jam-room-code-display');
    const roomMemberList = document.getElementById('jam-member-list');
    const jamStatusBtn = document.getElementById('jam-nav-status');

    if (!currentJamRoom) {
        if (activeSection) activeSection.style.display = 'none';
        if (inactiveSection) inactiveSection.style.display = 'block';
        if (jamStatusBtn) {
            jamStatusBtn.innerHTML = '<i class="fa-solid fa-users-viewfinder"></i> Start Jam';
            jamStatusBtn.classList.remove('active-jam-pulse');
        }
        return;
    }

    if (activeSection) activeSection.style.display = 'block';
    if (inactiveSection) inactiveSection.style.display = 'none';
    if (roomCodeDisplay) roomCodeDisplay.textContent = currentJamRoom.code;

    if (jamStatusBtn) {
        jamStatusBtn.innerHTML = `<i class="fa-solid fa-radio"></i> In Jam (${currentJamRoom.code})`;
        jamStatusBtn.classList.add('active-jam-pulse');
    }

    if (roomMemberList && currentJamRoom.members) {
        roomMemberList.innerHTML = currentJamRoom.members.map(m => `
            <div class="jam-member-badge" style="border-left: 3px solid ${m.avatarColor || '#1db954'}">
                <span class="member-name">${m.username} ${m.id === currentJamRoom.hostId ? '👑 (Host)' : ''}</span>
            </div>
        `).join('');
    }
}

function triggerFloatingReaction(emoji, fromUser, color) {
    const container = document.getElementById('floating-reactions-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.style.left = `${20 + Math.random() * 60}%`;
    el.innerHTML = `
        <span class="reaction-emoji">${emoji}</span>
        <span class="reaction-author" style="background:${color}">${fromUser}</span>
    `;
    container.appendChild(el);

    setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
    }, 2800);
}

function appendJamChatMessage(msg) {
    const chatContainer = document.getElementById('jam-chat-messages');
    if (!chatContainer) return;
    const msgEl = document.createElement('div');
    msgEl.className = 'jam-chat-item';
    msgEl.innerHTML = `
        <span class="chat-time">${msg.time}</span>
        <span class="chat-user" style="color: ${msg.color}">${msg.sender}:</span>
        <span class="chat-text">${msg.text}</span>
    `;
    chatContainer.appendChild(msgEl);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// --- EVENT LISTENERS ---

function initEventListeners() {
    // Play/Pause button
    if (playBtn) playBtn.addEventListener('click', () => togglePlayPause(true));

    // Next / Prev buttons
    if (nextBtn) nextBtn.addEventListener('click', () => playNext(true));
    if (prevBtn) prevBtn.addEventListener('click', () => playPrev(true));

    // Shuffle & Repeat buttons
    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => {
            isShuffle = !isShuffle;
            shuffleBtn.classList.toggle('active-control', isShuffle);
            showToast(isShuffle ? 'Shuffle is ON' : 'Shuffle is OFF');
        });
    }

    if (repeatBtn) {
        repeatBtn.addEventListener('click', () => {
            isRepeat = !isRepeat;
            repeatBtn.classList.toggle('active-control', isRepeat);
            showToast(isRepeat ? 'Repeat Track is ON' : 'Repeat is OFF');
        });
    }

    // Progress Bar Scrubbing
    if (progressBar) {
        progressBar.addEventListener('input', (e) => {
            seekTo(parseFloat(e.target.value), true);
        });
    }

    // Volume Slider
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) / 100;
            audio.volume = val;
            if (val === 0) {
                if (volumeIcon) volumeIcon.className = 'fa-solid fa-volume-xmark';
            } else if (val < 0.5) {
                if (volumeIcon) volumeIcon.className = 'fa-solid fa-volume-low';
            } else {
                if (volumeIcon) volumeIcon.className = 'fa-solid fa-volume-high';
            }
        });
    }

    // Volume Icon Click (Mute Toggle)
    if (volumeIcon) {
        volumeIcon.addEventListener('click', () => {
            if (audio.volume > 0) {
                audio.dataset.prevVolume = audio.volume;
                audio.volume = 0;
                if (volumeSlider) volumeSlider.value = 0;
                volumeIcon.className = 'fa-solid fa-volume-xmark';
            } else {
                const prev = parseFloat(audio.dataset.prevVolume) || 0.8;
                audio.volume = prev;
                if (volumeSlider) volumeSlider.value = prev * 100;
                volumeIcon.className = 'fa-solid fa-volume-high';
            }
        });
    }

    // Like Button in Bottom Bar
    if (playerLikeBtn) {
        playerLikeBtn.addEventListener('click', async () => {
            const currentSong = songs[currentIndex];
            if (!currentSong) return;
            try {
                const res = await fetch('/api/likes/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ songId: currentSong.id })
                });
                const data = await res.json();
                if (data.liked) {
                    likedSongIds.add(currentSong.id);
                    showToast(`Added "${currentSong.title}" to Liked Songs ❤️`);
                } else {
                    likedSongIds.delete(currentSong.id);
                    showToast(`Removed from Liked Songs`);
                }
                updateLikeButtonUI(currentSong.id);
            } catch (err) {
                console.error('Like toggle failed:', err);
            }
        });
    }

    // Sidebar Navigation: Home & Search
    if (navHomeBtn) {
        navHomeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navHomeBtn.parentElement.style.opacity = '1';
            if (navSearchBtn) navSearchBtn.parentElement.style.opacity = '0.7';
            if (homeContent) homeContent.style.display = 'block';
            if (searchView) searchView.style.display = 'none';
        });
    }

    if (navSearchBtn) {
        navSearchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navSearchBtn.parentElement.style.opacity = '1';
            if (navHomeBtn) navHomeBtn.parentElement.style.opacity = '0.7';
            if (homeContent) homeContent.style.display = 'none';
            if (searchView) searchView.style.display = 'block';
            if (searchInput) searchInput.focus();
            handleSearch('');
        });
    }

    // Search Input
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            handleSearch(e.target.value);
        });
    }

    // Keyboard Shortcuts (Space for Play/Pause, Arrow keys for Seek & Next/Prev)
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.code === 'Space') {
            e.preventDefault();
            togglePlayPause(true);
        } else if (e.code === 'ArrowRight' && e.ctrlKey) {
            e.preventDefault();
            playNext(true);
        } else if (e.code === 'ArrowLeft' && e.ctrlKey) {
            e.preventDefault();
            playPrev(true);
        }
    });

    // Create Playlist Buttons
    const handleCreatePlaylist = async () => {
        const title = prompt('Enter a name for your new playlist:', `My Playlist #${playlists.length + 1}`);
        if (!title) return;
        try {
            const res = await fetch('/api/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description: 'Created with real-time sync' })
            });
            const newP = await res.json();
            playlists.push(newP);
            renderPlaylists();
            showToast(`Playlist "${title}" created!`);
        } catch (err) {
            console.error(err);
        }
    };

    if (createPlaylistBtn) createPlaylistBtn.addEventListener('click', handleCreatePlaylist);
    const createPlaylistBtn2 = document.getElementById('create-playlist-btn-2');
    if (createPlaylistBtn2) createPlaylistBtn2.addEventListener('click', handleCreatePlaylist);

    const sidebarJamBtn = document.getElementById('sidebar-jam-btn');
    if (sidebarJamBtn) {
        sidebarJamBtn.addEventListener('click', () => {
            if (jamModal) jamModal.classList.add('open');
        });
    }

    // Jam Session Modal Triggers
    if (jamBtn) {
        jamBtn.addEventListener('click', () => {
            if (jamModal) jamModal.classList.toggle('open');
        });
    }
    if (jamModalClose) {
        jamModalClose.addEventListener('click', () => {
            if (jamModal) jamModal.classList.remove('open');
        });
    }

    // Jam Session Actions (Create, Join, Leave)
    const jamCreateBtn = document.getElementById('jam-create-btn');
    const jamJoinBtn = document.getElementById('jam-join-btn');
    const jamJoinInput = document.getElementById('jam-join-code-input');
    const jamLeaveBtn = document.getElementById('jam-leave-btn');
    const jamCopyBtn = document.getElementById('jam-copy-btn');

    if (jamCreateBtn) {
        jamCreateBtn.addEventListener('click', () => {
            socket.emit('jam:create', {
                roomName: `${myProfile.username}'s Jam Session`,
                songId: songs[currentIndex]?.id || 1
            });
        });
    }

    if (jamJoinBtn && jamJoinInput) {
        jamJoinBtn.addEventListener('click', () => {
            const code = jamJoinInput.value.trim();
            if (!code) return alert('Please enter a room code');
            socket.emit('jam:join', { roomCode: code });
        });
    }

    if (jamLeaveBtn) {
        jamLeaveBtn.addEventListener('click', () => {
            socket.emit('jam:leave');
            currentJamRoom = null;
            updateJamModalUI();
            showToast('Left Jam Session');
        });
    }

    if (jamCopyBtn) {
        jamCopyBtn.addEventListener('click', () => {
            if (currentJamRoom && currentJamRoom.code) {
                navigator.clipboard.writeText(currentJamRoom.code);
                showToast(`Copied Room Code: ${currentJamRoom.code}`);
            }
        });
    }

    // Live Floating Reactions
    document.querySelectorAll('.reaction-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji;
            if (currentJamRoom) {
                socket.emit('jam:reaction', { emoji });
            } else {
                triggerFloatingReaction(emoji, myProfile.username, myProfile.avatarColor);
                showToast('Start or join a Jam to share reactions with friends!');
            }
        });
    });

    // Jam Chat Send
    const chatInput = document.getElementById('jam-chat-input');
    const chatSendBtn = document.getElementById('jam-chat-send');
    if (chatSendBtn && chatInput) {
        const sendMsg = () => {
            const text = chatInput.value.trim();
            if (!text) return;
            if (currentJamRoom) {
                socket.emit('jam:chat_message', { message: text });
                chatInput.value = '';
            } else {
                showToast('Join a Jam session to chat in real-time!');
            }
        };
        chatSendBtn.addEventListener('click', sendMsg);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMsg();
        });
    }

    // Friend Activity Toggle
    if (friendToggleBtn && friendActivityDrawer) {
        friendToggleBtn.addEventListener('click', () => {
            friendActivityOpen = !friendActivityOpen;
            friendActivityDrawer.classList.toggle('open', friendActivityOpen);
            friendToggleBtn.classList.toggle('active-icon', friendActivityOpen);
        });
    }
}

// Toast notification helper
function showToast(message) {
    let toast = document.getElementById('spotify-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'spotify-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast.timeout);
    toast.timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2800);
}
