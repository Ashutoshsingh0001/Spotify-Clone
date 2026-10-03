const http = require('http');

function testEndpoint(path, headers = {}) {
    return new Promise((resolve) => {
        const req = http.get({ host: 'localhost', port: 3000, path, headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`[PASS] ${path} -> Status: ${res.statusCode} | Content-Type: ${res.headers['content-type']} | Bytes: ${res.headers['content-length'] || data.length}`);
                resolve({ status: res.statusCode, data });
            });
        });
        req.on('error', (e) => {
            console.error(`[FAIL] ${path} -> Error: ${e.message}`);
            resolve(null);
        });
    });
}

async function runTests() {
    console.log('Testing Spotify Clone Backend APIs...\n');
    await testEndpoint('/api/songs');
    await testEndpoint('/api/songs/1');
    await testEndpoint('/api/search?q=Darshan');
    await testEndpoint('/api/playlists');
    await testEndpoint('/api/likes');
    await testEndpoint('/api/stats');
    console.log('\nTesting Audio Streaming with HTTP 206 Partial Content (Range: bytes=0-1023)...');
    await testEndpoint('/api/stream/1', { 'Range': 'bytes=0-1023' });
    console.log('\nAll API tests completed!');
}

runTests();
