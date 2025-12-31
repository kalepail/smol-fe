import fs from 'fs';

const API_URL = 'https://api.smol.xyz';
const ID = '9ee8a605604e4456b61e960468376e6338be542b5791855703a694a7e284f025';

async function main() {
    const metaUrl = `${API_URL}/${ID}`;
    console.log(`Fetching ${metaUrl}...`);
    const res = await fetch(metaUrl);
    if (res.ok) {
        const data = await res.json();
        console.log('Keys:', Object.keys(data));
        console.log('Full:', JSON.stringify(data, null, 2));
    } else {
        console.log('Error', res.status);
    }
}

main();
