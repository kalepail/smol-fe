/**
 * Test script to verify OZ Channels API connection
 * Run with: node scripts/test-oz-channels.mjs
 */

const OZ_CHANNELS_URL = 'https://channels.openzeppelin.com';
const OZ_CHANNELS_API_KEY = '453552cd-3dd9-44a1-b344-066906059363';

async function testOzChannelsConnection() {
    console.log('🔌 Testing OZ Channels API connection...\n');
    console.log(`URL: ${OZ_CHANNELS_URL}`);
    console.log(`API Key: ${OZ_CHANNELS_API_KEY.substring(0, 8)}...`);
    console.log('');

    try {
        // Test 1: Check if the API endpoint responds (even without a valid transaction)
        // We'll send an empty/invalid payload and expect a validation error (not an auth error)
        // POST to root path (/) with Authorization: Bearer header
        const response = await fetch(`${OZ_CHANNELS_URL}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OZ_CHANNELS_API_KEY}`,
            },
            body: JSON.stringify({
                func: 'invalid_test_xdr',
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
