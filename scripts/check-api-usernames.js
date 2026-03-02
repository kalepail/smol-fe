
const API_URL = 'https://api.smol.xyz';

async function check() {
    try {
        console.log(`Checking ${API_URL}...`);

        // 1. Check Root
        console.log('\n--- Root ---');
        const res = await fetch(API_URL);
        const data = await res.json();
        console.log('Root keys:', Object.keys(data));
        const smols = data.smols || data;
        if (Array.isArray(smols) && smols.length > 0) {
            console.log('First item keys:', Object.keys(smols[0]));
        }

        // 2. Check /users
        console.log('\n--- /users ---');
        const resUsers = await fetch(`${API_URL}/users`);
        if (resUsers.ok) {
            const usersData = await resUsers.json();
            console.log(`Found data (type: ${typeof usersData})`);
            if (Array.isArray(usersData)) {
                console.log(`Count: ${usersData.length}`);
                if (usersData.length > 0) console.log('Sample:', usersData[0]);
            } else if (usersData.users) {
                console.log(`Count: ${usersData.users.length}`);
                console.log('Sample:', usersData.users[0]);
            }
        } else {
            console.log('Failed:', resUsers.status);
        }

        // 3. Check /playlist/top
        console.log('\n--- /playlist/top ---');
        const resPlay = await fetch(`${API_URL}/playlist/top?limit=10`);
        if (resPlay.ok) {
            const playData = await resPlay.json();
            console.log('Keys:', Object.keys(playData));
            if (playData.users) {
                console.log(`Found ${playData.users.length} users.`);
                const validUser = playData.users.find(u => u.Username);
                if (validUser) {
                    console.log('Sample user:', validUser);
                } else {
                    console.log('No users with Username found');
                }
            }
        } else {
            console.log('Failed:', resPlay.status);
        }

    } catch (e) {
        console.error(e);
    }
}

check();
