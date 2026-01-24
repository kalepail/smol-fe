<script lang="ts">
    import { onMount } from "svelte";
    import { validateEnvironmentOrThrow } from "../utils/env-validation";

    /**
     * App Initializer Component
     *
     * Runs critical initialization on app startup:
     * - Validates environment variables
     * - Sets up global error handlers
     * - Initializes telemetry (if needed)
     */

    onMount(() => {
        try {
            // Validate environment variables
            console.log('[AppInit] Validating environment configuration...');
            validateEnvironmentOrThrow();
            console.log('[AppInit] ✅ Environment validation passed');
        } catch (error) {
            console.error('[AppInit] ❌ Environment validation failed:', error);
            // Don't throw - let the app try to run anyway, but log the error
            // The user will see errors when they try to use features
        }

        // Set up global unhandled rejection handler
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            console.error('[AppInit] Unhandled promise rejection:', event.reason);
            // Don't prevent default - let browser handle it
        };

        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        // Cleanup on unmount
        return () => {
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    });
</script>

<!-- This component has no UI, it just runs initialization logic -->
