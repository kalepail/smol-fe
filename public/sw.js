const CACHE_NAME = "smol-image-cache-v1";
const ASSETS_TO_CACHE = []; // We primarily cache runtime images, not static assets here (yet)

// Install Event: Skip waiting to activate immediately
self.addEventListener("install", (event) => {
    self.skipWaiting();
});

// Activate Event: Claim clients immediately
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Stale-While-Revalidate for Images
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Intercept API Image requests
    if (url.href.includes("api.smol.xyz/image/")) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    // Return cached response immediately if found
                    const fetchPromise = fetch(event.request).then((networkResponse) => {
                        // Update cache with new version
                        if (networkResponse.ok) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });

                    // If cached, return it, but still update in background (Stale-While-Revalidate)
                    // ACTUALLY: For immutable images (IDs don't change), Cache-First is better.
                    // Let's assume images with same ID change rarely or never.
                    // If they DO change, we might need a version query param or SWR.
                    // Given "instant load" requirement, Cache-First is safer for UX.
                    return cachedResponse || fetchPromise;
                });
            })
        );
    }
});
