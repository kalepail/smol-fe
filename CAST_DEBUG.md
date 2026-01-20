# Google Cast Debugging Guide

This document explains how to debug Google Cast (Chromecast) issues on mobile and desktop.

## Quick Start

### Enable Debug Mode

1. **In Browser Console:**
   ```javascript
   localStorage.setItem("CAST_DEBUG", "true")
   ```
   Then reload the page.

2. **Or add to `.env`:**
   ```
   PUBLIC_CAST_DEBUG=true
   ```

### Using Cast Diagnostics Panel

For development, you can add the Cast Diagnostics panel to any page:

```svelte
<script>
    import CastDiagnostics from "../components/dev/CastDiagnostics.svelte";
</script>

{#if import.meta.env.DEV}
    <CastDiagnostics />
{/if}
```

The panel provides:
- **Run Diagnostics**: Tests the audio URL for Chromecast compatibility
- **Print Cast State**: Logs current Cast state to console
- **Toggle Debug Mode**: Enable/disable verbose logging

## What Gets Logged

With `CAST_DEBUG` enabled, you'll see detailed logs for:

### Session Events
- Session state changes (STARTED, RESUMED, ENDED)
- Connection state changes
- Session errors

### Media Loading
- Full LoadRequest payload (contentId, contentType, streamType, metadata)
- Load success/failure
- Error codes with contentId details

### Player State
- Player state changes (IDLE, BUFFERING, PLAYING, PAUSED)
- Idle reasons (ERROR, CANCELLED, FINISHED)
- Playback progress (current time / duration)
- Pause/resume events

## Quick Audio URL Test

Use the validation script to test audio endpoints:

```bash
node scripts/test-cast-audio.js https://noot.smol.xyz/api/audio/SONG_ID
```

This tests:
- HEAD request returns 200
- Content-Type is audio/*
- Range request returns **206** (critical!)
- Accept-Ranges: bytes header present
- CORS headers configured

## Using Cast Debug Logger (Alternative)

Google's official Cast debugging tool streams receiver logs to your terminal:

**Install:**
```bash
npm install -g cast-debug-logger
```

**Run:**
```bash
cast-debug-logger --device=YOUR_CAST_IP
```

You'll see real-time logs from the Cast device including media errors.

## Diagnosing Common Issues

### Issue: "Artwork flashes then blue Cast logo"

This means the receiver loaded but **media failed to load**.

**Run diagnostics:**
```javascript
// In console after loading Cast SDK
await castService.diagnoseMediaUrl("YOUR_AUDIO_URL");
```

**Check for:**
1. ✅ HEAD returns 200 with correct `Content-Type: audio/mpeg`
2. ✅ Range request returns **206 Partial Content** (not 200)
3. ✅ `Accept-Ranges: bytes` header present
4. ✅ `Content-Range` header in 206 response

**Common fixes:**
- Audio proxy must support Range requests (return 206)
- Must include `Accept-Ranges: bytes` header
- Must include proper CORS headers (`Access-Control-Allow-Origin: *`)
- URL must be HTTPS (except localhost)

### Issue: No audio plays

**Check:**
1. Is `streamType` set to `BUFFERED`?
   - Look for: `[Cast] Load request: { streamType: "BUFFERED" }`
2. Is `contentType` correct (`audio/mpeg`)?
3. Check player state transitions in console

### Issue: Cast button doesn't work

**Check:**
1. Is Cast SDK loaded? Look for: `[Cast] SDK available: true`
2. Is Cast initialized? Look for: `[Cast] Initialized with CastContext`
3. Are you on HTTPS or localhost?

## Architecture Notes

### Audio URL Flow
```
User plays song
    ↓
castService.loadMedia(song)
    ↓
contentId = ${window.location.origin}/api/audio/${songId}
    ↓
Chromecast fetches from /api/audio/[id]
    ↓
Proxy forwards to api.smol.xyz/song/${id}.mp3
```

### Critical Headers (Chromecast Requirements)

**Audio Proxy Must Return:**
- `Content-Type: audio/mpeg`
- `Accept-Ranges: bytes`
- `Access-Control-Allow-Origin: *`
- For Range requests: `206 Partial Content` + `Content-Range: bytes x-y/total`

### MediaInfo Requirements

```typescript
const mediaInfo = new chrome.cast.media.MediaInfo(audioUrl, "audio/mpeg");
mediaInfo.streamType = cast.framework.messages.StreamType.BUFFERED; // CRITICAL!

const request = new chrome.cast.media.LoadRequest(mediaInfo);
request.autoplay = true;
request.currentTime = 0;
```

## Testing on Android with Receiver Debugging

### Step 1: Get Cast Device IP
1. Open Google Home app
2. Tap your Cast device → Settings (gear icon)
3. Note the IP address (e.g., `192.168.1.100`)

### Step 2: Open Receiver Debugger
In **desktop Chrome**, open:
```
http://YOUR_CAST_DEVICE_IP:9222
```

This opens Chrome DevTools for the receiver. Keep this tab open!

### Step 3: Enable Debug Mode on Mobile
On **Android Chrome**, open console and run:
```javascript
localStorage.setItem("CAST_DEBUG", "true")
```
Then reload the page.

### Step 4: Start Casting
1. Tap Cast button and select your device
2. Play a song
3. Watch **BOTH**:
   - Mobile Chrome console (sender logs)
   - Desktop receiver debugger (receiver logs + Network tab)

### Step 5: Check for Issues

**In receiver Network tab**, look for the audio request:
- Status should be `206` for range requests (not 200)
- Check for `net::ERR_FAILED` or CORS errors

**In receiver Console**, look for:
- `MEDIA_ERR_SRC_NOT_SUPPORTED` - No Range support or wrong codec
- `MEDIA_ERR_NETWORK` - Can't fetch audio
- `Failed to load media` - Various media errors

**Pass criteria:**
- Receiver shows artwork continuously
- Audio plays
- Progress updates in console
- Network tab shows 206 responses

**Fail criteria:**
- Artwork flashes then blue logo
- Player state goes IDLE with reason ERROR
- No audio
- Network tab shows 200 responses to Range requests

## Receiver-Side Errors & Fixes

### Error: `MEDIA_ERR_SRC_NOT_SUPPORTED`

**Cause:** Audio URL doesn't support Range requests or wrong Content-Type

**Check in receiver Network tab:**
- Is the audio request returning `200` instead of `206`?
- Is `Accept-Ranges: bytes` missing?

**Fix:** Ensure audio proxy returns 206 + Content-Range for Range requests

### Error: `net::ERR_FAILED`

**Cause:** CORS issue or URL not accessible from Cast device

**Check:**
- Is `Access-Control-Allow-Origin: *` present?
- Can the Cast device reach the URL? (same network?)
- Is it HTTPS? (required for Cast)

### Error: Artwork shows then blue logo

**Cause:** Media load succeeded but stream failed (usually Range request issue)

**Receiver Console shows:**
```
Media element error: MEDIA_ERR_SRC_NOT_SUPPORTED
```

**Fix:** The audio proxy must:
1. Return `206 Partial Content` for Range requests (not 200)
2. Include `Content-Range: bytes 0-1023/TOTAL` header
3. Include `Accept-Ranges: bytes` header

**Test:**
```bash
curl -I -H "Range: bytes=0-1023" https://noot.smol.xyz/api/audio/SONG_ID
```

Should return:
```
HTTP/2 206
content-range: bytes 0-1023/3456789
accept-ranges: bytes
content-type: audio/mpeg
```

## Files Modified for Cast Fixes

- `/src/services/cast.ts` - Enhanced diagnostics, strict LoadRequest
- `/src/pages/api/audio/[id].ts` - Added Range support, HEAD support
- `/src/components/dev/CastDiagnostics.svelte` - Dev diagnostics panel

## References

- [Cast Web Sender API](https://developers.google.com/cast/docs/web_sender)
- [Media Track Metadata](https://developers.google.com/cast/docs/reference/web_sender/chrome.cast.media.MusicTrackMediaMetadata)
- [HTTP Range Requests (RFC 7233)](https://httpwg.org/specs/rfc7233.html)
