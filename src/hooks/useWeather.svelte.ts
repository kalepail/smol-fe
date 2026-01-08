export const weatherState = $state<{
    code: number | null; // WMO Weather interpretation code
    isDay: boolean; // 0 or 1
    loading: boolean;
    error: string | null;
}>({
    code: null,
    isDay: true,
    loading: false,
    error: null
});

// WMO Weather Codes (simplified for our use)
// 0: Clear sky
// 1, 2, 3: Mainly clear, partly cloudy, and overcast
// 45, 48: Fog
// 51, 53, 55: Drizzle
// 61, 63, 65: Rain
// 71, 73, 75: Snow
// 80, 81, 82: Rain showers
// 95, 96, 99: Thunderstorm

export async function initWeather() {
    if (typeof navigator === 'undefined') return;

    if (weatherState.loading || weatherState.code !== null) return; // Already loaded or loading

    weatherState.loading = true;

    // Clever bypass: Use IP Geolocation to avoid permission prompt
    try {
        const ipRes = await fetch('https://ipapi.co/json/');
        if (!ipRes.ok) throw new Error('IP Geo failed');
        const { latitude, longitude } = await ipRes.json();

        console.log(`[Weather] Located via IP: ${latitude}, ${longitude}`);

        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
        );

        if (!response.ok) throw new Error('Weather API failed');

        const data = await response.json();
        const { weathercode, is_day } = data.current_weather;

        weatherState.code = weathercode;
        weatherState.isDay = is_day === 1;
        console.log("[Weather] Updated:", { weathercode, is_day });

    } catch (err: any) {
        console.error("[Weather] Failed:", err);
        // Fallback or just ignore (defaults to clear)
        weatherState.error = err.message;
    } finally {
        weatherState.loading = false;
    }
}

export function getWeatherCondition(): 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' {
    const code = weatherState.code;
    if (code === null) return 'clear'; // Default

    if (code === 0 || code === 1) return 'clear';
    if (code === 2 || code === 3 || code === 45 || code === 48) return 'cloudy';
    if (code >= 51 && code <= 67) return 'rain';
    if (code >= 80 && code <= 82) return 'rain';
    if (code >= 71 && code <= 77) return 'snow';
    if (code >= 95) return 'storm';

    return 'clear';
}
