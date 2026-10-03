const { io } = require('socket.io-client');

async function testWebSockets() {
    console.log('Testing Real-Time Socket.io Synchronization & Jam Rooms...\n');

    const client1 = io('http://localhost:3000', { forceNew: true, transports: ['websocket'] });
    const client2 = io('http://localhost:3000', { forceNew: true, transports: ['websocket'] });

    await new Promise(res => client1.on('connect', res));
    console.log('[PASS] Client 1 connected to WebSockets');

    await new Promise(res => client2.on('connect', res));
    console.log('[PASS] Client 2 connected to WebSockets');

    let createdRoomCode = null;

    // 1. Client 1 creates a Jam room
    client1.emit('jam:create', { roomName: 'Daft Punk Party', songId: 1 });

    await new Promise(resolve => {
        client1.on('jam:created', (room) => {
            console.log(`[PASS] Client 1 successfully created Jam room: ${room.code}`);
            createdRoomCode = room.code;
            resolve();
        });
    });

    // 2. Client 2 joins the Jam room
    client2.emit('jam:join', { roomCode: createdRoomCode });

    await new Promise(resolve => {
        client2.on('jam:joined', (room) => {
            console.log(`[PASS] Client 2 joined room ${room.code} (Members: ${room.members.length})`);
            resolve();
        });
    });

    // 3. Client 1 plays track at 15.4 seconds -> Client 2 must receive live sync
    client1.emit('jam:sync_playback', {
        action: 'play',
        currentTime: 15.4,
        songId: 2
    });

    await new Promise(resolve => {
        client2.on('jam:state_changed', (state) => {
            console.log(`[PASS] Client 2 received real-time state change: action=${state.action}, time=${state.playbackTime}, song=${state.currentSong?.title}`);
            resolve();
        });
    });

    // 4. Client 2 sends a live reaction -> Client 1 receives it
    client2.emit('jam:reaction', { emoji: '🔥' });

    await new Promise(resolve => {
        client1.on('jam:reaction_broadcast', (data) => {
            console.log(`[PASS] Client 1 received real-time reaction: ${data.emoji} from ${data.fromUser}`);
            resolve();
        });
    });

    // 5. Client 2 sends a live chat message -> Client 1 receives it
    client2.emit('jam:chat_message', { message: 'This song is awesome!' });

    await new Promise(resolve => {
        client1.on('jam:new_message', (msg) => {
            console.log(`[PASS] Client 1 received live chat message: "${msg.text}" from ${msg.sender}`);
            resolve();
        });
    });

    client1.disconnect();
    client2.disconnect();

    console.log('\nAll Real-Time WebSocket tests PASSED successfully!\n');
    process.exit(0);
}

testWebSockets().catch(err => {
    console.error('Socket test error:', err);
    process.exit(1);
});
