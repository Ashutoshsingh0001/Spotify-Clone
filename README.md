# Spotify Web Player - Real-Time Backend & Client

A fully functional, real-time backend and web client for Spotify Clone featuring HTTP 206 partial content audio streaming, synchronized group listening (**Spotify Jam**), real-time friend activity presence feed, real-time search, playlists, and live party reactions.

---

## 🌟 Real-Time Features

1. **HTTP 206 Audio Streaming Engine (`/api/stream/:id`)**:
   - Streams audio with support for `Range` requests (`bytes=start-end`), enabling instant scrubbing, seeking, and smooth buffering.
   - Built-in rich library of musical tracks generated locally with melodic chords, basslines, and beats.

2. **Spotify Jam / "Listen Together" (Live Synchronized Group Playback)**:
   - Create or join listening rooms with a room code (e.g., `JAM-7292`).
   - Playback state (Play, Pause, Seek, Track Changes) is synchronized in real time across all room members over WebSockets (Socket.io).
   - Real-time member list with colorful profile avatars and host designation.

3. **Live Friend Activity Feed**:
   - Displays real-time presence of other online listeners.
   - Live visual indicator and song information showing what tracks friends are currently playing.

4. **Live Party Reactions & Room Chat**:
   - Floating animated emoji reactions (`🔥`, `❤️`, `🎵`, `🕺`, `🎉`, `✨`) broadcasted across the party screen.
   - Instant room chat for group discussions during listening sessions.

5. **REST API & Playlists**:
   - `GET /api/songs`: All songs with rich metadata.
   - `GET /api/search?q=query`: Debounced instant search.
   - `GET /api/playlists` & `POST /api/playlists`: Real-time synced playlist management.
   - `GET /api/likes` & `POST /api/likes/toggle`: Liked songs state synchronized across clients.
   - `GET /api/stats`: Live connected users, stream count, and active Jam rooms.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Real-Time Server
```bash
npm start
```
The server will start at: **`http://localhost:3000`**

### 3. Testing Real-Time Collaboration
1. Open [http://localhost:3000](http://localhost:3000) in your main browser window.
2. Open a second window (or Incognito tab) at [http://localhost:3000](http://localhost:3000).
3. In Window 1, click **Start Jam** and create a room.
4. Copy the generated code (e.g., `JAM-1234`) and enter it in Window 2.
5. Hit play or seek in either window — both windows play and stay in sync in real time!
