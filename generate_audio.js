const fs = require('fs');
const path = require('path');

const musicDir = path.join(__dirname, 'music');
if (!fs.existsSync(musicDir)) {
    fs.mkdirSync(musicDir, { recursive: true });
}

function writeWavFile(filename, sampleRate, samples) {
    const numChannels = 2;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = samples.length * (bitsPerSample / 8);
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF chunk descriptor
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // "fmt " sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);

    // "data" sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        const val = s < 0 ? s * 32768 : s * 32767;
        buffer.writeInt16LE(Math.floor(val), offset);
        offset += 2;
    }

    fs.writeFileSync(filename, buffer);
    console.log(`Saved ${filename} (${(dataSize / 1024 / 1024).toFixed(2)} MB)`);
}

function noteFreq(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
}

// Generate Track 1: Lo-Fi Chillhop Dream (Tempo 85 BPM, Key C minor / Eb major)
function generateLofiBeat(durationSec = 45) {
    const sr = 22050; // crisp and lightweight
    const totalSamples = sr * durationSec * 2; // stereo: L, R
    const samples = new Float32Array(totalSamples);
    const bpm = 82;
    const beatSec = 60 / bpm;
    const barSec = beatSec * 4;

    const chords = [
        [48, 55, 60, 63, 67], // Cm9
        [44, 51, 56, 60, 63], // Abmaj7
        [46, 53, 58, 62, 65], // Bb9
        [43, 50, 55, 58, 62]  // Gm7
    ];

    const melodyNotes = [67, 70, 72, 75, 72, 70, 67, 65, 63, 65, 67, 72];

    for (let t = 0; t < sr * durationSec; t++) {
        const timeSec = t / sr;
        const currentBar = Math.floor(timeSec / barSec) % chords.length;
        const barPos = (timeSec % barSec);
        const beatPos = (timeSec % beatSec);
        const beatIndex = Math.floor(timeSec / beatSec) % 4;

        let left = 0;
        let right = 0;

        // 1. Warm Electric Piano Chords
        const chord = chords[currentBar];
        chord.forEach((note, idx) => {
            const freq = noteFreq(note);
            const env = Math.exp(-0.8 * barPos) * (1 - Math.exp(-20 * barPos));
            // additive harmonics for warm Rhodes/EP sound
            const sound = Math.sin(2 * Math.PI * freq * timeSec) * 0.6 +
                          Math.sin(4 * Math.PI * freq * timeSec) * 0.25 +
                          Math.sin(6 * Math.PI * freq * timeSec) * 0.1;
            const pan = 0.3 + 0.4 * (idx / chord.length);
            left += sound * env * 0.12 * (1 - pan);
            right += sound * env * 0.12 * pan;
        });

        // 2. Deep Sub-Bass
        const bassNote = chord[0] - 12; // deep octave
        const bassFreq = noteFreq(bassNote);
        const bassEnv = Math.exp(-0.5 * (timeSec % (beatSec * 2)));
        const bass = Math.sin(2 * Math.PI * bassFreq * timeSec) * bassEnv * 0.22;
        left += bass;
        right += bass;

        // 3. Lo-Fi Lead Melody
        const melIdx = Math.floor((timeSec / (beatSec / 2))) % melodyNotes.length;
        const melNote = melodyNotes[melIdx];
        const melBeatPos = timeSec % (beatSec / 2);
        const melEnv = Math.exp(-4 * melBeatPos) * (1 - Math.exp(-30 * melBeatPos));
        const melVibrato = 1 + 0.008 * Math.sin(2 * Math.PI * 5 * timeSec);
        const melSound = Math.sin(2 * Math.PI * noteFreq(melNote) * melVibrato * timeSec);
        left += melSound * melEnv * 0.09 * 0.4;
        right += melSound * melEnv * 0.09 * 0.6;

        // 4. Lo-Fi Drum Kit (Kick, Snare, Hihat)
        // Kick on beat 0 and 2.5
        const kick1 = (beatIndex === 0 && beatPos < 0.25);
        const kick2 = (beatIndex === 2 && beatPos > 0.45 && beatPos < 0.7);
        if (kick1 || kick2) {
            const kt = kick1 ? beatPos : (beatPos - 0.5);
            const kFreq = Math.max(45, 130 * Math.exp(-25 * kt));
            const kEnv = Math.exp(-12 * kt);
            const kick = Math.sin(2 * Math.PI * kFreq * kt) * kEnv * 0.35;
            left += kick;
            right += kick;
        }

        // Snare on beat 1 and 3
        if (beatIndex === 1 || beatIndex === 3) {
            const st = beatPos;
            if (st < 0.2) {
                const noise = (Math.random() * 2 - 1) * Math.exp(-18 * st);
                const tone = Math.sin(2 * Math.PI * 180 * st) * Math.exp(-22 * st);
                const snare = (noise * 0.7 + tone * 0.3) * 0.2;
                left += snare;
                right += snare;
            }
        }

        // Closed Hihat on eighth notes
        const hatPos = timeSec % (beatSec / 2);
        if (hatPos < 0.06) {
            const hat = (Math.random() * 2 - 1) * Math.exp(-60 * hatPos) * 0.07;
            left += hat * 0.7;
            right += hat * 0.3;
        }

        // Vinyl crackle subtle atmosphere
        if (Math.random() < 0.003) {
            const crackle = (Math.random() * 2 - 1) * 0.03;
            left += crackle;
            right += crackle;
        }

        samples[t * 2] = left;
        samples[t * 2 + 1] = right;
    }

    return { sampleRate: sr, samples };
}

// Generate Track 2: Mahhi Sona - Acoustic & Romantic Melody (Tempo 95 BPM, D major)
function generateAcousticVibe(durationSec = 45) {
    const sr = 22050;
    const totalSamples = sr * durationSec * 2;
    const samples = new Float32Array(totalSamples);
    const bpm = 94;
    const beatSec = 60 / bpm;
    const barSec = beatSec * 4;

    const chords = [
        [50, 54, 57, 62], // D
        [45, 49, 52, 57], // A
        [47, 50, 54, 59], // Bm
        [43, 47, 50, 55]  // G
    ];

    const fluteNotes = [62, 66, 69, 74, 71, 69, 66, 67, 69, 71, 74, 78, 74, 69];

    for (let t = 0; t < sr * durationSec; t++) {
        const timeSec = t / sr;
        const currentBar = Math.floor(timeSec / barSec) % chords.length;
        const barPos = timeSec % barSec;
        const beatPos = timeSec % beatSec;
        const beatIndex = Math.floor(timeSec / beatSec) % 4;

        let left = 0;
        let right = 0;

        // Acoustic Guitar style arpeggio
        const chord = chords[currentBar];
        const arpStep = Math.floor((timeSec / (beatSec / 4))) % 8;
        const arpNoteIndex = [0, 1, 2, 3, 2, 1, 2, 3][arpStep];
        const note = chord[arpNoteIndex];
        const stepPos = timeSec % (beatSec / 4);
        const gtrEnv = Math.exp(-6 * stepPos) * (1 - Math.exp(-40 * stepPos));
        const gtrFreq = noteFreq(note);
        const gtrSound = (Math.sin(2 * Math.PI * gtrFreq * timeSec) +
                          0.4 * Math.sin(4 * Math.PI * gtrFreq * timeSec) +
                          0.15 * Math.sin(6 * Math.PI * gtrFreq * timeSec));
        const pan = 0.2 + 0.6 * (arpStep / 8);
        left += gtrSound * gtrEnv * 0.15 * (1 - pan);
        right += gtrSound * gtrEnv * 0.15 * pan;

        // Warm Pad in background
        chord.forEach(n => {
            const pf = noteFreq(n);
            const pad = Math.sin(2 * Math.PI * pf * timeSec) * 0.03;
            left += pad;
            right += pad;
        });

        // Bansuri / Flute style romantic melody
        const melStep = Math.floor(timeSec / (beatSec * 0.8)) % fluteNotes.length;
        const melNote = fluteNotes[melStep];
        const melPos = timeSec % (beatSec * 0.8);
        const fluteEnv = Math.sin(Math.PI * Math.min(1, melPos / (beatSec * 0.8)));
        const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * timeSec);
        const flute = Math.sin(2 * Math.PI * noteFreq(melNote) * vibrato * timeSec) * fluteEnv * 0.14;
        left += flute * 0.6;
        right += flute * 0.4;

        // Tabla / Soft percussion rhythm
        if (beatIndex === 0 || beatIndex === 2) {
            if (beatPos < 0.18) {
                const bayan = Math.sin(2 * Math.PI * (80 - 30 * beatPos) * beatPos) * Math.exp(-12 * beatPos) * 0.25;
                left += bayan;
                right += bayan;
            }
        }
        if (beatIndex === 1 || beatIndex === 3) {
            if (beatPos < 0.12) {
                const dayan = Math.sin(2 * Math.PI * 290 * beatPos) * Math.exp(-24 * beatPos) * 0.18;
                left += dayan * 0.5;
                right += dayan * 0.5;
            }
        }

        samples[t * 2] = left;
        samples[t * 2 + 1] = right;
    }
    return { sampleRate: sr, samples };
}

// Generate Track 3: Top 50 Global Synthwave / Electro Pop (120 BPM, F# minor)
function generateSynthwave(durationSec = 45) {
    const sr = 22050;
    const totalSamples = sr * durationSec * 2;
    const samples = new Float32Array(totalSamples);
    const bpm = 120;
    const beatSec = 60 / bpm;
    const barSec = beatSec * 4;

    const chords = [
        [42, 49, 54, 57], // F#m
        [38, 45, 50, 54], // D
        [40, 47, 52, 56], // E
        [45, 52, 57, 61]  // A
    ];

    for (let t = 0; t < sr * durationSec; t++) {
        const timeSec = t / sr;
        const currentBar = Math.floor(timeSec / barSec) % chords.length;
        const beatPos = timeSec % beatSec;
        const beatIndex = Math.floor(timeSec / beatSec) % 4;

        let left = 0;
        let right = 0;

        // 16th note rolling bassline
        const bassStep = Math.floor((timeSec / (beatSec / 4))) % 16;
        const bassNote = chords[currentBar][0];
        const stepPos = timeSec % (beatSec / 4);
        const bassEnv = Math.exp(-14 * stepPos);
        const bFreq = noteFreq(bassNote);
        // Sawtooth approximation for punchy synthwave bass
        let saw = 0;
        for (let h = 1; h <= 6; h++) {
            saw += (1 / h) * Math.sin(2 * Math.PI * bFreq * h * timeSec);
        }
        const bass = saw * bassEnv * 0.16;
        left += bass;
        right += bass;

        // Synth chord stabs on off-beats
        if (beatPos > beatSec * 0.45 && beatPos < beatSec * 0.85) {
            const stabPos = beatPos - beatSec * 0.5;
            if (stabPos > 0) {
                const stabEnv = Math.exp(-8 * stabPos);
                chords[currentBar].forEach(n => {
                    const sf = noteFreq(n + 12);
                    const stab = Math.sin(2 * Math.PI * sf * timeSec) * 0.04;
                    left += stab * stabEnv;
                    right += stab * stabEnv;
                });
            }
        }

        // 4-on-the-floor punchy Kick Drum
        if (beatPos < 0.18) {
            const kFreq = Math.max(40, 150 * Math.exp(-35 * beatPos));
            const kick = Math.sin(2 * Math.PI * kFreq * beatPos) * Math.exp(-14 * beatPos) * 0.38;
            left += kick;
            right += kick;
        }

        // Snare/Clap on 2 and 4
        if (beatIndex === 1 || beatIndex === 3) {
            if (beatPos < 0.16) {
                const clap = (Math.random() * 2 - 1) * Math.exp(-22 * beatPos) * 0.22;
                left += clap;
                right += clap;
            }
        }

        // Open hi-hat on upbeat
        if (beatPos > beatSec * 0.45 && beatPos < beatSec * 0.75) {
            const ohatPos = beatPos - beatSec * 0.5;
            const ohat = (Math.random() * 2 - 1) * Math.exp(-35 * ohatPos) * 0.08;
            left += ohat * 0.7;
            right += ohat * 0.3;
        }

        samples[t * 2] = left;
        samples[t * 2 + 1] = right;
    }
    return { sampleRate: sr, samples };
}

// Generate Track 4: Cinematic Piano Chill (75 BPM, A minor)
function generatePianoChill(durationSec = 45) {
    const sr = 22050;
    const totalSamples = sr * durationSec * 2;
    const samples = new Float32Array(totalSamples);
    const bpm = 75;
    const beatSec = 60 / bpm;
    const barSec = beatSec * 4;

    const chords = [
        [45, 52, 57, 60, 64], // Am
        [41, 48, 53, 57, 60], // F
        [43, 50, 55, 59, 62], // G
        [40, 47, 52, 55, 59]  // Em
    ];
    const melody = [69, 72, 76, 74, 72, 71, 69, 67, 65, 69, 72, 71];

    for (let t = 0; t < sr * durationSec; t++) {
        const timeSec = t / sr;
        const currentBar = Math.floor(timeSec / barSec) % chords.length;
        const barPos = timeSec % barSec;
        const beatPos = timeSec % beatSec;

        let left = 0;
        let right = 0;

        // Gentle grand piano chords
        const chord = chords[currentBar];
        chord.forEach((n, i) => {
            const pf = noteFreq(n);
            const env = Math.exp(-0.7 * barPos) * (1 - Math.exp(-25 * barPos));
            const sound = Math.sin(2 * Math.PI * pf * timeSec) * 0.6 +
                          Math.sin(4 * Math.PI * pf * timeSec) * 0.25 +
                          Math.sin(6 * Math.PI * pf * timeSec) * 0.1;
            const pan = 0.2 + 0.6 * (i / chord.length);
            left += sound * env * 0.11 * (1 - pan);
            right += sound * env * 0.11 * pan;
        });

        // Piano High Melody
        const melStep = Math.floor(timeSec / (beatSec * 1.5)) % melody.length;
        const mNote = melody[melStep];
        const mPos = timeSec % (beatSec * 1.5);
        const mEnv = Math.exp(-2.2 * mPos) * (1 - Math.exp(-30 * mPos));
        const mSound = Math.sin(2 * Math.PI * noteFreq(mNote) * timeSec) +
                       0.3 * Math.sin(4 * Math.PI * noteFreq(mNote) * timeSec);
        left += mSound * mEnv * 0.12 * 0.4;
        right += mSound * mEnv * 0.12 * 0.6;

        // Sub bass
        const bassFreq = noteFreq(chord[0] - 12);
        const bassEnv = Math.exp(-0.4 * barPos);
        const bass = Math.sin(2 * Math.PI * bassFreq * timeSec) * bassEnv * 0.18;
        left += bass;
        right += bass;

        samples[t * 2] = left;
        samples[t * 2 + 1] = right;
    }
    return { sampleRate: sr, samples };
}

// Generate Track 5: Deep House Groove (124 BPM)
function generateDeepHouse(durationSec = 45) {
    const sr = 22050;
    const totalSamples = sr * durationSec * 2;
    const samples = new Float32Array(totalSamples);
    const bpm = 124;
    const beatSec = 60 / bpm;
    const barSec = beatSec * 4;

    const chords = [
        [43, 50, 55, 58], // Gm
        [46, 53, 58, 62], // Bb
        [41, 48, 53, 57], // F
        [39, 46, 51, 55]  // Eb
    ];

    for (let t = 0; t < sr * durationSec; t++) {
        const timeSec = t / sr;
        const currentBar = Math.floor(timeSec / barSec) % chords.length;
        const beatPos = timeSec % beatSec;
        const beatIndex = Math.floor(timeSec / beatSec) % 4;

        let left = 0;
        let right = 0;

        // Organ chord stab on offbeat
        if (beatPos > beatSec * 0.5 && beatPos < beatSec * 0.8) {
            const sp = beatPos - beatSec * 0.5;
            const env = Math.exp(-12 * sp);
            chords[currentBar].forEach(n => {
                const f = noteFreq(n + 12);
                const snd = (Math.sin(2*Math.PI*f*timeSec) + 0.5*Math.sin(4*Math.PI*f*timeSec)) * 0.05;
                left += snd * env;
                right += snd * env;
            });
        }

        // Punchy FM bass
        const bassStep = Math.floor(timeSec / (beatSec / 2)) % 8;
        if ([0, 2, 3, 5, 6].includes(bassStep)) {
            const bp = timeSec % (beatSec / 2);
            const bEnv = Math.exp(-16 * bp);
            const bf = noteFreq(chords[currentBar][0]);
            const fm = Math.sin(2 * Math.PI * (bf * 2) * timeSec) * 2;
            const bSnd = Math.sin(2 * Math.PI * bf * timeSec + fm) * bEnv * 0.2;
            left += bSnd;
            right += bSnd;
        }

        // Deep 4-on-floor Kick
        if (beatPos < 0.2) {
            const kFreq = Math.max(38, 140 * Math.exp(-32 * beatPos));
            const kick = Math.sin(2 * Math.PI * kFreq * beatPos) * Math.exp(-12 * beatPos) * 0.4;
            left += kick;
            right += kick;
        }

        // Shaker & Hi-hat
        const hatPos = timeSec % (beatSec / 4);
        if (hatPos < 0.04) {
            const hat = (Math.random() * 2 - 1) * Math.exp(-50 * hatPos) * 0.06;
            left += hat;
            right += hat;
        }

        samples[t * 2] = left;
        samples[t * 2 + 1] = right;
    }
    return { sampleRate: sr, samples };
}

// Generate Track 6: Trending Punjabi / Bollywood Pop Beat (102 BPM)
function generateDesiPopBeat(durationSec = 45) {
    const sr = 22050;
    const totalSamples = sr * durationSec * 2;
    const samples = new Float32Array(totalSamples);
    const bpm = 100;
    const beatSec = 60 / bpm;
    const barSec = beatSec * 4;

    const chords = [
        [48, 55, 60], // C
        [43, 50, 55], // G
        [45, 52, 57], // Am
        [41, 48, 53]  // F
    ];
    const riff = [72, 74, 76, 79, 76, 74, 72, 69, 72, 76, 74, 72];

    for (let t = 0; t < sr * durationSec; t++) {
        const timeSec = t / sr;
        const currentBar = Math.floor(timeSec / barSec) % chords.length;
        const beatPos = timeSec % beatSec;
        const beatIndex = Math.floor(timeSec / beatSec) % 4;

        let left = 0;
        let right = 0;

        // Dholak / Tumbi rhythmic pattern
        // Tumbi high plucked string
        const tumbiStep = Math.floor(timeSec / (beatSec / 4)) % riff.length;
        const tNote = riff[tumbiStep];
        const tPos = timeSec % (beatSec / 4);
        const tEnv = Math.exp(-20 * tPos);
        const tFreq = noteFreq(tNote);
        const tumbi = (Math.sin(2*Math.PI*tFreq*timeSec) + 0.6*Math.sin(4*Math.PI*tFreq*timeSec)) * tEnv * 0.16;
        left += tumbi * 0.7;
        right += tumbi * 0.3;

        // Dhol bass thump on 0 and 2
        if (beatIndex === 0 || beatIndex === 2) {
            if (beatPos < 0.22) {
                const dhol = Math.sin(2*Math.PI*(90 - 40*beatPos)*beatPos) * Math.exp(-10*beatPos) * 0.38;
                left += dhol;
                right += dhol;
            }
        }
        // Dhol treble snap on 1 and 3
        if (beatIndex === 1 || beatIndex === 3) {
            if (beatPos < 0.15) {
                const snap = ((Math.random()*2 - 1)*0.6 + Math.sin(2*Math.PI*450*beatPos)*0.4) * Math.exp(-25*beatPos) * 0.24;
                left += snap;
                right += snap;
            }
        }

        // Sub bass
        const bf = noteFreq(chords[currentBar][0] - 12);
        const bEnv = Math.exp(-1.5 * (timeSec % (beatSec * 2)));
        const bass = Math.sin(2 * Math.PI * bf * timeSec) * bEnv * 0.22;
        left += bass;
        right += bass;

        samples[t * 2] = left;
        samples[t * 2 + 1] = right;
    }
    return { sampleRate: sr, samples };
}

console.log('Generating audio tracks for Spotify clone...');

const tracks = [
    { file: 'track1.wav', fn: () => generateLofiBeat(60) },
    { file: 'track2.wav', fn: () => generateAcousticVibe(60) },
    { file: 'track3.wav', fn: () => generateSynthwave(60) },
    { file: 'track4.wav', fn: () => generatePianoChill(60) },
    { file: 'track5.wav', fn: () => generateDeepHouse(60) },
    { file: 'track6.wav', fn: () => generateDesiPopBeat(60) },
];

tracks.forEach(tr => {
    const res = tr.fn();
    writeWavFile(path.join(musicDir, tr.file), res.sampleRate, res.samples);
});

console.log('All audio tracks generated successfully!');
