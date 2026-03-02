<script lang="ts">
    import { onMount } from "svelte";
    import { validateEnvironmentOrThrow } from "../utils/env-validation";
    import { reportCriticalError } from "../utils/monitoring";

    /**
     * App Initializer Component
     *
     * Runs critical initialization on app startup:
     * - Validates environment variables
     * - Sets up global error handlers
     * - Initializes telemetry (if needed)
     */
    import { useBalanceAutoRefresh } from "../hooks/useBalanceAutoRefresh.svelte";

    // Global hooks
    useBalanceAutoRefresh();

    onMount(() => {
        try {
            // Validate environment variables
            console.log("[AppInit] Validating environment configuration...");
            validateEnvironmentOrThrow();
            console.log("[AppInit] ✅ Environment validation passed");
        } catch (error) {
            console.error("[AppInit] ❌ Environment validation failed:", error);
            // Don't throw - let the app try to run anyway, but log the error
            // The user will see errors when they try to use features
        }

        // Set up global unhandled rejection handler
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            console.error(
                "[AppInit] Unhandled promise rejection:",
                event.reason,
            );
            reportCriticalError({
                scope: "app-init.unhandledrejection",
                message: String(
                    (event.reason as Error)?.message ?? event.reason,
                ),
                metadata: {
                    reasonType: typeof event.reason,
                },
                stack:
                    typeof event.reason === "object" &&
                    event.reason !== null &&
                    "stack" in (event.reason as Record<string, unknown>)
                        ? String(
                              (event.reason as Record<string, unknown>).stack ??
                                  "",
                          )
                        : undefined,
                timestamp: new Date().toISOString(),
            });
            // Don't prevent default - let browser handle it
        };

        window.addEventListener("unhandledrejection", handleUnhandledRejection);

        // Cleanup on unmount
        return () => {
            window.removeEventListener(
                "unhandledrejection",
                handleUnhandledRejection,
            );
        };
    });
</script>

<!-- This component has no UI, it just runs initialization logic -->
