
async function test() {
    try {
        const res = await fetch('http://localhost:4321/api/radio/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context: 'chill lo-fi beats' })
        });
        const data = await res.json();
        console.log('STATUS:', res.status);
        console.log('DATA:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('ERROR:', e.message);
    }
}
test();
