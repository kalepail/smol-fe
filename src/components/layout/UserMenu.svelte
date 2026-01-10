<script lang="ts">
  import { userState, ensureWalletConnected } from "../../stores/user.svelte";
  import {
    balanceState,
    updateContractBalance,
    resetBalance,
  } from "../../stores/balance.svelte";
  import {
    mixtapeModeState,
    mixtapeDraftHasContent,
    enterMixtapeMode,
    exitMixtapeMode,
  } from "../../stores/mixtape.svelte";
  import { uiState, toggleMenu } from "../../stores/ui.svelte";
  import { useAuthentication } from "../../hooks/useAuthentication";
  import { useCurrentPath } from "../../hooks/useCurrentPath.svelte";
  import AuthButtons from "./AuthButtons.svelte";
  import UserBalance from "./UserBalance.svelte";
  import MixtapeModeToggle from "./MixtapeModeToggle.svelte";

  interface Props {
    initialKeyId: string | null;
    initialContractId: string | null;
  }

  let { initialKeyId, initialContractId }: Props = $props();

  const authHook = useAuthentication();
  const currentPath = useCurrentPath();
  const path = $derived(currentPath.path);

  let creating = $state(false);

  // Initialize user state from server props
  userState.contractId = initialContractId;
  userState.keyId = initialKeyId;

  // Track last processed auth state to prevent duplicate operations
  let lastProcessedContractId = $state<string | null>(null);
  let lastProcessedKeyId = $state<string | null>(null);

  // React to prop changes during navigation
  $effect(() => {
    // Only process if props actually changed
    if (
      initialContractId !== lastProcessedContractId ||
      initialKeyId !== lastProcessedKeyId
    ) {
      lastProcessedContractId = initialContractId;
      lastProcessedKeyId = initialKeyId;

      // Update userState
      userState.contractId = initialContractId;
      userState.keyId = initialKeyId;

      if (initialContractId && initialKeyId) {
        // User authenticated - connect wallet and fetch balance
        ensureWalletConnected().catch((error) => {
          console.error("[UserMenu] Failed to connect wallet:", error);
        });

        updateContractBalance(initialContractId).catch((error) => {
          console.error("[UserMenu] Failed to fetch balance:", error);
        });
      } else {
        // User logged out - reset balance
        resetBalance();
      }
    }
  });

  // Listen for login requests from other components (like RadioPlayer)
  $effect(() => {
    const handleRequest = () => handleLogin();
    window.addEventListener("smol:request-login", handleRequest);
    return () =>
      window.removeEventListener("smol:request-login", handleRequest);
  });

  async function handleLogin() {
    await authHook.login();
  }

  async function handleSignUp() {
    creating = true;

    try {
      const username = prompt("Enter your username");

      if (!username) {
        throw new Error("Username is required");
      }

      await authHook.signUp(username);
    } finally {
      creating = false;
    }
  }

  async function handleLogout() {
    await authHook.logout();
  }

  function handleMixtapeClick() {
    if (mixtapeModeState.active) {
      if (mixtapeDraftHasContent.current) {
        const confirmed = confirm(
          "Exit Mixtape Mode? Your draft will stay saved locally.",
        );
        if (!confirmed) return;
      }
      exitMixtapeMode();
    } else {
      enterMixtapeMode();
    }
  }

  const isAuthenticated = $derived(userState.contractId !== null);
</script>

<!-- Mixtape Mode Toggle stays outside if requested, otherwise it can move too. 
     User said "keep mixtapes button outside". 
     The MixtapeModeToggle is for the builder mode. 
     The Mixtapes link is already in Navigation. -->
<div class="flex items-center gap-4 pr-1">
  {#if isAuthenticated}
    <div class="hidden md:block">
      <MixtapeModeToggle
        active={mixtapeModeState.active}
        hasDraft={mixtapeDraftHasContent.current}
        onClick={handleMixtapeClick}
      />
    </div>
  {/if}

  <button
    class="text-[#9ae600] hover:text-white transition-colors font-pixel tracking-wider text-[10px] md:text-xs border border-transparent hover:border-[#9ae600]/30 px-2 py-1"
    onclick={toggleMenu}
  >
    {uiState.isMenuOpen ? "[CLOSE]" : "+MENU"}
  </button>
</div>
