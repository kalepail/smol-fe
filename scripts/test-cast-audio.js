#!/usr/bin/env node
/**
 * Cast Audio Endpoint Validator
 *
 * Tests if an audio URL meets Chromecast requirements:
 * - Returns 206 for Range requests
 * - Includes Accept-Ranges: bytes
 * - Has correct Content-Type
 * - Proper CORS headers
 *
 * Usage:
 *   node scripts/test-cast-audio.js https://noot.smol.xyz/api/audio/SONG_ID
 */

const testUrl = process.argv[2];

if (!testUrl) {
    console.error('❌ Usage: node test-cast-audio.js <AUDIO_URL>');
    process.exit(1);
}

console.log('🔍 Testing Cast audio compatibility...');
console.log('URL:', testUrl);
console.log('');

async function testCastCompatibility(url) {
    try {
        // Test 1: HEAD request
        console.log('📋 Test 1: HEAD request');
        const headResponse = await fetch(url, { method: 'HEAD' });

        console.log('  Status:', headResponse.status, headResponse.status === 200 ? '✅' : '❌');
        console.log('  Content-Type:', headResponse.headers.get('Content-Type') || '(missing)');
        console.log('  Content-Length:', headResponse.headers.get('Content-Length') || '(missing)');
        console.log('  Accept-Ranges:', headResponse.headers.get('Accept-Ranges') || '(missing)');
        console.log('  CORS:', headResponse.headers.get('Access-Control-Allow-Origin') || '(missing)');
        console.log('');

        // Test 2: Range request
        console.log('📋 Test 2: Range request (bytes=0-1023)');
        const rangeResponse = await fetch(url, {
            headers: { 'Range': 'bytes=0-1023' }
        });

        console.log('  Status:', rangeResponse.status, rangeResponse.status === 206 ? '✅' : '❌ (should be 206)');
        console.log('  Content-Range:', rangeResponse.headers.get('Content-Range') || '(missing)');
        console.log('  Accept-Ranges:', rangeResponse.headers.get('Accept-Ranges') || '(missing)');
        console.log('  Content-Length:', rangeResponse.headers.get('Content-Length') || '(missing)');
        console.log('');

        // Validation
        console.log('📊 VALIDATION RESULTS:');
        console.log('');

        const headOk = headResponse.status === 200;
        const contentType = headResponse.headers.get('Content-Type');
        const contentTypeOk = contentType?.startsWith('audio/');
        const rangeOk = rangeResponse.status === 206;
        const acceptRanges = rangeResponse.headers.get('Accept-Ranges');
        const acceptRangesOk = acceptRanges === 'bytes';
        const cors = headResponse.headers.get('Access-Control-Allow-Origin');
        const corsOk = cors === '*' || cors;

        console.log(`  ${headOk ? '✅' : '❌'} HEAD returns 200`);
        console.log(`  ${contentTypeOk ? '✅' : '❌'} Content-Type is audio/* (got: ${contentType})`);
        console.log(`  ${rangeOk ? '✅' : '❌'} Range request returns 206 (got: ${rangeResponse.status})`);
        console.log(`  ${acceptRangesOk ? '✅' : '❌'} Accept-Ranges is "bytes" (got: ${acceptRanges})`);
        console.log(`  ${corsOk ? '✅' : '❌'} CORS enabled (got: ${cors})`);
        console.log('');

        const allPass = headOk && contentTypeOk && rangeOk && acceptRangesOk && corsOk;

        if (allPass) {
            console.log('✅ SUCCESS! URL is Chromecast-compatible');
            return true;
        } else {
            console.log('❌ FAILED! URL has compatibility issues');
            console.log('');
            console.log('Common fixes:');
            if (!rangeOk) console.log('  - Audio proxy must return 206 for Range requests (not 200)');
            if (!acceptRangesOk) console.log('  - Add "Accept-Ranges: bytes" header');
            if (!contentTypeOk) console.log('  - Set correct Content-Type: audio/mpeg');
            if (!corsOk) console.log('  - Add "Access-Control-Allow-Origin: *" header');
            return false;
        }

    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
        return false;
    }
}

testCastCompatibility(testUrl)
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
