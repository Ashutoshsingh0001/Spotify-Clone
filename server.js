const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Song catalog with rich metadata
const songs = [
    {
        id: 1,
        title: "Top 50 - Global",
        artist: "The Weeknd & Daft Punk",
        album: "Starboy Hits",
        cover: "./assests/card1img.jpeg",
        duration: 60,
        genre: "Synthwave / Pop",
        file: "track3.wav",
        category: "recently-played"
    },
    {
        id: 2,
        title: "Mahhi Sona",
        artist: "Darshan Raval",
        album: "Judaiyaan",
        cover: "./assests/card2img.jpeg",
        duration: 60,
        genre: "Acoustic Pop",
        file: "track2.wav",
        category: "trending"
    },
    {
        id: 3,
        title: "Midnight Chillhop",
        artist: "Lofi Fruits Music",
        album: "Coffee & Rain",
        cover: "./assests/card3img.jpeg",
        duration: 60,
        genre: "Lo-Fi / Chillhop",
        file: "track1.wav",
        category: "trending"
    },
    {
        id: 4,
        title: "Retro Neon Highway",
        artist: "Kavinsky & FM-84",
        album: "OutRun Forever",
        cover: "./assests/card4img.jpeg",
        duration: 60,
        genre: "Synthwave",
        file: "track3.wav",
        category: "trending"
    },
    {
        id: 5,
        title: "Peaceful Piano Dreams",
        artist: "Ludovico & Yiruma",
        album: "Nocturne Echoes",
        cover: "./assests/card5img.jpeg",
        duration: 60,
        genre: "Classical / Ambient",
        file: "track4.wav",
        category: "featured"
    },
    {
        id: 6,
        title: "Top Songs India - Dhol Mix",
        artist: "Diljit Dosanjh & Badshah",
        album: "Desi Vibes Vol. 1",
        cover: "./assests/card6img.jpeg",
        duration: 60,
        genre: "Punjabi Pop",
        file: "track6.wav",
        category: "featured"
    },
    {
        id: 7,
        title: "Sunset Beach Groove",
        artist: "Klangkarussell & Nora",
        album: "Ibiza Deep Sessions",
        cover: "./assests/card4img.jpeg",
        duration: 60,
        genre: "Deep House",
        file: "track5.wav",
        category: "trending"
    },
    {
        id: 8,
        title: "Global Echoes - Top 50",
        artist: "Metro Boomin & Future",
        album: "Heroes & Villains",
        cover: "./assests/card1img.jpeg",
        duration: 60,
        genre: "Hip-Hop / Chill",
        file: "track1.wav",
        category: "recently-played"
    }
];

// In-memory Playlists
let playlists = [
    {
        id: "p1",
        title: "My Favorite Hits",
        description: "Your daily rotation of favorites",
        trackIds: [1, 2, 3]
    },
    {
        id: "p2",
        title: "Late Night Lo-Fi",
        description: "Relax, study and unwind",
        trackIds: [3, 4, 5]
    }
];

// In-memory Liked Songs
let likedSongIds = new Set([2]);

// In-memory Jam Rooms (Listen Together)
const jamRooms = new Map();

// Global Stats
let totalStreamsCount = 42;

// --- HTTP REST API ENDPOINTS ---

// 1. Get all songs or filter by category
app.get('/api/songs', (req, res) => {
    const { category } = req.query;
    if (category) {
        return res.json(songs.filter(s => s.category === category));
    }
    res.json(songs);
});

// 2. Get single song by ID
app.get('/api/songs/:id', (req, res) => {
    const songId = parseInt(req.params.id, 10);
    const song = songs.find(s => s.id === songId);
    if (!song) return res.status(404).json({ error: "Song not found" });
    res.json(song);
});

// 3. Real-time Search Endpoint
app.get('/api/search', (req, res) => {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q) return res.json(songs);
    const results = songs.filter(s => 
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q)
    );
    res.json(results);
});

// 4. Audio Streaming Endpoint with Range Request (HTTP 206 Partial Content)
app.get('/api/stream/:id', (req, res) => {
    const songId = parseInt(req.params.id, 10);
    const song = songs.find(s => s.id === songId);
    if (!song) return res.status(404).json({ error: "Song not found" });

    const filePath = path.join(__dirname, 'music', song.file);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Audio file missing" });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    totalStreamsCount++;
    io.emit('stats:update', { totalStreams: totalStreamsCount, onlineUsers: io.engine.clientsCount });

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'audio/wav',
        };
        res.writeHead(206, head);
        fileStream.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'audio/wav',
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
    }
});

// 5. Playlists Endpoints
app.get('/api/playlists', (req, res) => {
    const enriched = playlists.map(p => ({
        ...p,
        tracks: p.trackIds.map(id => songs.find(s => s.id === id)).filter(Boolean)
    }));
    res.json(enriched);
});

app.post('/api/playlists', (req, res) => {
    const { title, description } = req.body;
    if (!title || !title.trim()) {
        return res.status(400).json({ error: "Playlist title is required" });
    }
    const newPlaylist = {
        id: 'p_' + Date.now(),
        title: title.trim(),
        description: description ? description.trim() : "Created on " + new Date().toLocaleDateString(),
        trackIds: []
    };
    playlists.push(newPlaylist);
    io.emit('playlists:updated', playlists);
    res.status(201).json(newPlaylist);
});

app.post('/api/playlists/:id/add', (req, res) => {
    const playlist = playlists.find(p => p.id === req.params.id);
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });
    const { songId } = req.body;
    const parsedSongId = parseInt(songId, 10);
    if (!playlist.trackIds.includes(parsedSongId)) {
        playlist.trackIds.push(parsedSongId);
        io.emit('playlists:updated', playlists);
    }
    res.json(playlist);
});

// 6. Liked Songs Endpoints
app.get('/api/likes', (req, res) => {
    res.json(Array.from(likedSongIds));
});

app.post('/api/likes/toggle', (req, res) => {
    const { songId } = req.body;
    const id = parseInt(songId, 10);
    let liked = false;
    if (likedSongIds.has(id)) {
        likedSongIds.delete(id);
        liked = false;
    } else {
        likedSongIds.add(id);
        liked = true;
    }
    io.emit('likes:updated', Array.from(likedSongIds));
    res.json({ songId: id, liked, allLikes: Array.from(likedSongIds) });
});

// 7. Server Stats
app.get('/api/stats', (req, res) => {
    res.json({
        totalStreams: totalStreamsCount,
        onlineUsers: io.engine.clientsCount,
        activeRooms: jamRooms.size
    });
});

// --- REAL-TIME WEBSOCKETS (SOCKET.IO) ---

const connectedUsers = new Map(); // socket.id -> { username, avatarColor, currentSong, isPlaying }

const defaultAvatars = [
    '#1db954', '#ff5722', '#00bcd4', '#e91e63', '#9c27b0', '#ff9800', '#3f51b5'
];

io.on('connection', (socket) => {
    const randomColor = defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];
    const randomUserNum = Math.floor(100 + Math.random() * 900);
    const username = `SpotifyFan#${randomUserNum}`;

    connectedUsers.set(socket.id, {
        id: socket.id,
        username,
        avatarColor: randomColor,
        currentSong: null,
        isPlaying: false,
        joinedAt: Date.now()
    });

    console.log(`[Socket Connected] ${socket.id} (${username}) | Total Online: ${connectedUsers.size}`);

    // Broadcast updated user presence & stats
    io.emit('presence:list', Array.from(connectedUsers.values()));
    io.emit('stats:update', {
        totalStreams: totalStreamsCount,
        onlineUsers: connectedUsers.size,
        activeRooms: jamRooms.size
    });

    // Send client their assigned profile
    socket.emit('profile:init', connectedUsers.get(socket.id));

    // Handle user updating their display name
    socket.on('profile:update', (data) => {
        const user = connectedUsers.get(socket.id);
        if (user && data.username) {
            user.username = data.username.trim().slice(0, 25);
            io.emit('presence:list', Array.from(connectedUsers.values()));
        }
    });

    // Handle real-time player activity broadcast (Friend Activity Feed)
    socket.on('activity:playing', (activityData) => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            user.currentSong = activityData.song || null;
            user.isPlaying = !!activityData.isPlaying;
            user.currentTime = activityData.currentTime || 0;
            // Broadcast live to all connected friends
            io.emit('presence:list', Array.from(connectedUsers.values()));
        }
    });

    // --- SPOTIFY JAM / LISTEN TOGETHER ROOMS ---

    // 1. Create a Jam Room
    socket.on('jam:create', ({ roomName, songId }) => {
        const roomCode = 'JAM-' + Math.floor(1000 + Math.random() * 9000);
        const song = songs.find(s => s.id === parseInt(songId || 1, 10)) || songs[0];
        
        const roomData = {
            code: roomCode,
            name: roomName || `${connectedUsers.get(socket.id)?.username || 'Host'}'s Jam`,
            hostId: socket.id,
            hostName: connectedUsers.get(socket.id)?.username || 'Host',
            currentSong: song,
            isPlaying: false,
            playbackTime: 0,
            lastSyncTime: Date.now(),
            queue: [song],
            members: [connectedUsers.get(socket.id)]
        };

        jamRooms.set(roomCode, roomData);
        socket.join(roomCode);
        socket.currentRoom = roomCode;

        console.log(`[Jam Room Created] Code: ${roomCode} by ${socket.id}`);
        socket.emit('jam:created', roomData);
        io.emit('jam:rooms_list', getPublicRoomsList());
        io.emit('stats:update', {
            totalStreams: totalStreamsCount,
            onlineUsers: connectedUsers.size,
            activeRooms: jamRooms.size
        });
    });

    // 2. Join a Jam Room
    socket.on('jam:join', ({ roomCode }) => {
        const code = (roomCode || '').toUpperCase().trim();
        const room = jamRooms.get(code);

        if (!room) {
            return socket.emit('jam:error', { message: `Room "${code}" not found!` });
        }

        socket.join(code);
        socket.currentRoom = code;

        const user = connectedUsers.get(socket.id);
        if (user && !room.members.some(m => m.id === socket.id)) {
            room.members.push(user);
        }

        // Calculate synchronized playback position based on elapsed time if playing
        let syncedTime = room.playbackTime;
        if (room.isPlaying) {
            const elapsedSec = (Date.now() - room.lastSyncTime) / 1000;
            syncedTime = Math.min(room.currentSong.duration, room.playbackTime + elapsedSec);
        }

        socket.emit('jam:joined', { ...room, playbackTime: syncedTime });
        io.to(code).emit('jam:member_joined', { user, memberCount: room.members.length, members: room.members });
        io.emit('jam:rooms_list', getPublicRoomsList());
    });

    // 3. Leave Room
    socket.on('jam:leave', () => {
        leaveCurrentRoom(socket);
    });

    // 4. Playback State Synchronization (Play, Pause, Seek, Track Change)
    socket.on('jam:sync_playback', (data) => {
        const roomCode = socket.currentRoom;
        if (!roomCode || !jamRooms.has(roomCode)) return;

        const room = jamRooms.get(roomCode);
        const { action, currentTime, songId } = data;

        if (songId && (!room.currentSong || room.currentSong.id !== songId)) {
            const song = songs.find(s => s.id === parseInt(songId, 10));
            if (song) room.currentSong = song;
        }

        if (action === 'play') {
            room.isPlaying = true;
            room.playbackTime = typeof currentTime === 'number' ? currentTime : room.playbackTime;
            room.lastSyncTime = Date.now();
        } else if (action === 'pause') {
            room.isPlaying = false;
            room.playbackTime = typeof currentTime === 'number' ? currentTime : room.playbackTime;
            room.lastSyncTime = Date.now();
        } else if (action === 'seek') {
            room.playbackTime = currentTime;
            room.lastSyncTime = Date.now();
        }

        // Broadcast to ALL members in this room (including sender for confirmation)
        io.to(roomCode).emit('jam:state_changed', {
            action,
            currentSong: room.currentSong,
            isPlaying: room.isPlaying,
            playbackTime: room.playbackTime,
            timestamp: Date.now(),
            triggeredBy: connectedUsers.get(socket.id)?.username || 'A member'
        });
    });

    // 5. Shared Queue Management
    socket.on('jam:add_to_queue', ({ songId }) => {
        const roomCode = socket.currentRoom;
        if (!roomCode || !jamRooms.has(roomCode)) return;

        const room = jamRooms.get(roomCode);
        const song = songs.find(s => s.id === parseInt(songId, 10));
        if (song) {
            room.queue.push(song);
            io.to(roomCode).emit('jam:queue_updated', {
                queue: room.queue,
                addedBy: connectedUsers.get(socket.id)?.username || 'User'
            });
        }
    });

    // 6. Real-time Live Floating Reaction (Party Mode!)
    socket.on('jam:reaction', ({ emoji }) => {
        const roomCode = socket.currentRoom;
        if (!roomCode) return;
        io.to(roomCode).emit('jam:reaction_broadcast', {
            emoji: emoji || '🔥',
            fromUser: connectedUsers.get(socket.id)?.username || 'Anonymous',
            color: connectedUsers.get(socket.id)?.avatarColor || '#1db954'
        });
    });

    // 7. Real-time Room Chat Message
    socket.on('jam:chat_message', ({ message }) => {
        const roomCode = socket.currentRoom;
        if (!roomCode || !message || !message.trim()) return;
        const msgObj = {
            id: 'msg_' + Date.now(),
            text: message.trim().slice(0, 200),
            sender: connectedUsers.get(socket.id)?.username || 'Anonymous',
            color: connectedUsers.get(socket.id)?.avatarColor || '#1db954',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        io.to(roomCode).emit('jam:new_message', msgObj);
    });

    // Disconnect Handler
    socket.on('disconnect', () => {
        leaveCurrentRoom(socket);
        connectedUsers.delete(socket.id);
        console.log(`[Socket Disconnected] ${socket.id} | Total Online: ${connectedUsers.size}`);
        io.emit('presence:list', Array.from(connectedUsers.values()));
        io.emit('stats:update', {
            totalStreams: totalStreamsCount,
            onlineUsers: connectedUsers.size,
            activeRooms: jamRooms.size
        });
    });
});

function leaveCurrentRoom(socket) {
    const roomCode = socket.currentRoom;
    if (!roomCode || !jamRooms.has(roomCode)) return;

    const room = jamRooms.get(roomCode);
    socket.leave(roomCode);
    socket.currentRoom = null;

    room.members = room.members.filter(m => m.id !== socket.id);

    if (room.members.length === 0) {
        jamRooms.delete(roomCode);
        console.log(`[Jam Room Closed] Code: ${roomCode} (all left)`);
    } else {
        if (room.hostId === socket.id) {
            room.hostId = room.members[0].id;
            room.hostName = room.members[0].username;
        }
        io.to(roomCode).emit('jam:member_left', {
            userId: socket.id,
            memberCount: room.members.length,
            members: room.members,
            newHost: room.hostName
        });
    }

    io.emit('jam:rooms_list', getPublicRoomsList());
}

function getPublicRoomsList() {
    return Array.from(jamRooms.values()).map(r => ({
        code: r.code,
        name: r.name,
        hostName: r.hostName,
        currentSong: r.currentSong,
        memberCount: r.members.length,
        isPlaying: r.isPlaying
    }));
}

server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🎵 Spotify Clone Real-Time Backend running!`);
    console.log(`📡 Local server: http://localhost:${PORT}`);
    console.log(`⚡ WebSockets: Active (Socket.io listening)`);
    console.log(`====================================================`);
});
