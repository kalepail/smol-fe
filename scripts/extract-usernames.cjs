
const fs = require('fs');

const API_URL = 'https://api.smol.xyz';

async function run() {
    try {
        const playlists = ['top', 'latest', 'weekly', 'fresh', 'classics', 'all'];
        const allUsernames = new Map(); // Address -> Username

        console.log('Starting extraction...');

        for (const p of playlists) {
            try {
                process.stdout.write(`Checking /playlist/${p}... `);
                const res = await fetch(`${API_URL}/playlist/${p}?limit=100`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.users && Array.isArray(data.users)) {
                        let count = 0;
                        data.users.forEach(u => {
                            if (u.Username && u.Address) {
                                allUsernames.set(u.Address, u.Username);
                                count++;
                            }
                        });
                        console.log(`Found ${count} users.`);
                    } else {
                        console.log('No users array.');
                    }
                } else {
                    console.log(`Failed (${res.status}).`);
                }
            } catch (err) {
                console.log('Error:', err.message);
            }
        }

        const lines = [];
        for (const [addr, name] of allUsernames) {
            lines.push(`${name} (${addr})`);
        }

        console.log(`\nTotal unique usernames found: ${lines.length}`);

        if (lines.length > 0) {
            fs.writeFileSync('usernames.txt', lines.join('\n'));
            console.log(`Wrote to usernames.txt`);
        }
    } catch (e) {
        console.error(e);
    }
}

run();
