<script lang="ts">
    import { onMount } from "svelte";
    import { userState } from "../../stores/user.svelte";

    interface Props {
        isAuthenticatedServer: boolean;
    }

    let { isAuthenticatedServer }: Props = $props();

    onMount(() => {
        // Bypass if already on onboarding
        if (window.location.pathname.startsWith("/onboarding")) return;
        if (window.location.pathname.startsWith("/artist/")) return;

        // Bypass if user is authenticated (Server check is faster than waiting for store)
        if (isAuthenticatedServer) return;
        if (userState.contractId) return;

        // Check flags
        const complete = localStorage.getItem("smol_onboarding_complete");
        const skipped = localStorage.getItem("smol_passkey_skipped");

        // If neither flag exists, it's a new user session -> Redirect
        if (!complete && !skipped) {
            // Check cookie one last time to be safe?
            // If cookie exists, isAuthenticatedServer should have been true ideally.
            // But if client-side login happened without page reload?
            if (document.cookie.includes("smol_token")) return;

            window.location.href = "/onboarding/passkey";
        }
    });
</script>
