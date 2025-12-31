const API_URL = 'https://api.smol.xyz';

async function main() {
    const res = await fetch(API_URL);
    const data = await res.json();
    const smols = data.smols || [];
    console.log(`Found ${smols.length} smols.`);

    if (smols.length > 0) {
        const s = smols[0];
        console.log('Keys:', Object.keys(s));
        console.log('Sample:', JSON.stringify(s, null, 2));

        // Guess audio URL
        const audioUrl = `${API_URL}/song/${s.Id}.mp3`; // Common pattern
        console.log('Testing Audio URL HEAD:', audioUrl);

        try {
            const head = await fetch(audioUrl, { method: 'HEAD' });
            console.log('HEAD status:', head.status);
            if (head.ok) {
                const len = head.headers.get('content-length');
                console.log('Content-Length:', len);
                if (len) {
                    const bytes = parseInt(len);
                    // Estimate: 128kbps = 16000 bytes/s approximately?
                    // 128 kbit/s = 128000 bits/s = 16000 bytes/s.
                    // 3 mins = 180s * 16000 = 2,880,000 bytes (2.8MB).
                    const seconds = bytes / 16000;
                    console.log(`Estimated Duration (128kbps): ${seconds.toFixed(2)}s`);
                }
            }
        } catch (e) {
            console.error('HEAD failed:', e.message);
        }
    }
}

main().catch(console.error);
