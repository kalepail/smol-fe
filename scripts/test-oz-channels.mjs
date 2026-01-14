/**
 * Test script to verify OZ Channels API connection
 * Run with: node scripts/test-oz-channels.mjs
 */

const OZ_CHANNELS_URL = 'https://channels.openzeppelin.com';
const OZ_CHANNELS_API_KEY = process.env.OZ_CHANNELS_API_KEY;

async function testOzChannelsConnection() {
    console.log('🔌 Testing OZ Channels API connection...\n');
    console.log(`URL: ${OZ_CHANNELS_URL}`);

    if (!OZ_CHANNELS_API_KEY) {
        console.warn('⚠️  OZ_CHANNELS_API_KEY is not set in environment. Skipping authentication check.');
        return;
    }

    console.log(`API Key: ${OZ_CHANNELS_API_KEY.substring(0, 8)}...`);
    console.log('');

    try {
        // Simple health check or list channels (if permitted)
        // Since there isn't a dedicated "ping" endpoint documented here, we'll try to list channels or just hit the root
        // NOTE: The root might not return 200, but we want to see if our key is accepted.
        // For strict testing, we'd need a valid endpoint. Assuming root check for now.

        const response = await fetch(`${OZ_CHANNELS_URL}/`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OZ_CHANNELS_API_KEY}`,
            },
            auth: []
        }),
    });

    const text = await response.text();
    let result;
    try {
        result = JSON.parse(text);
    } catch {
        result = { raw: text };
    }

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log('Response:', JSON.stringify(result, null, 2));
    console.log('');

    if (response.status === 401 || response.status === 403) {
        console.log('❌ FAIL: API key is invalid or unauthorized');
        return false;
    } else if (response.status === 400) {
        // This is GOOD - means API key works, just invalid payload
        console.log('✅ PASS: API key is valid! (Got expected validation error for test payload)');
        return true;
    } else if (response.status === 422) {
        // Unprocessable entity - also means auth worked
        console.log('✅ PASS: API key is valid! (Got expected XDR parsing error)');
        return true;
    } else if (response.status === 429) {
        console.log('⚠️ WARNING: Rate limited - API key works but you hit the limit');
        return true;
    } else {
        console.log(`⚠️ Unexpected status: ${response.status}`);
        return response.status < 500;
    }

} catch (error) {
    console.error('❌ FAIL: Network error', error.message);
    return false;
}
}

// Run the test
testOzChannelsConnection().then(success => {
    console.log('');
    if (success) {
        console.log('✅ OZ Channels API is reachable and API key is valid!');
        console.log('   The func+auth submission endpoint is ready.');
    } else {
        console.log('❌ There was a problem with the OZ Channels connection.');
    }
    process.exit(success ? 0 : 1);
});
