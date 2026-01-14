/**
 * Test OZ Channels using the OFFICIAL SDK
 * Run with: node scripts/test-oz-sdk.mjs
 */

import { ChannelsClient } from '@openzeppelin/relayer-plugin-channels';

const API_KEY = '453552cd-3dd9-44a1-b344-066906059363';

async function testOzChannelsSDK() {
    console.log('🔌 Testing OZ Channels with OFFICIAL SDK...\n');
    console.log(`API Key: ${API_KEY.substring(0, 8)}...`);
    console.log('');

    try {
        // Initialize the official client
        const client = new ChannelsClient({
            baseUrl: 'https://channels.openzeppelin.com',
            apiKey: API_KEY,
        });

        console.log('✓ ChannelsClient initialized successfully');

        // Try to submit a dummy request - expect validation error, not auth error
        console.log('\nTesting API key by sending invalid func+auth...');

        try {
            const result = await client.submitSorobanTransaction({
                func: 'invalid_test_xdr',
                auth: [],
            });
            console.log('Unexpected success:', result);
        } catch (error) {
            // Check if it's an auth error or a validation error
            const errorMsg = error.message || String(error);
            console.log('Error received:', errorMsg);

            if (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('unauthorized')) {
                console.log('\n❌ FAIL: API key is invalid (401 Unauthorized)');
                return false;
            } else if (errorMsg.includes('400') || errorMsg.includes('invalid') || errorMsg.includes('parse') || errorMsg.includes('XDR')) {
                console.log('\n✅ PASS: API key is valid! (Got expected validation error)');
                return true;
            } else {
                console.log('\n⚠️ UNKNOWN: Got unexpected error type');
                console.log('Full error:', error);
                return false;
            }
        }

    } catch (error) {
        console.error('❌ FAIL: SDK initialization or request failed');
        console.error('Error:', error.message || error);
        return false;
    }
}

testOzChannelsSDK().then(success => {
    console.log('');
    if (success) {
        console.log('✅ OZ Channels API key is working!');
    } else {
        console.log('❌ OZ Channels API key verification failed');
    }
    process.exit(success ? 0 : 1);
});
