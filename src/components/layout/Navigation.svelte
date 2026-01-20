<script lang="ts">
  import { userState } from "../../stores/user.svelte";
  import { balanceState } from "../../stores/balance.svelte";
  import { useCurrentPath } from "../../hooks/useCurrentPath.svelte";
  import { useAuthentication } from "../../hooks/useAuthentication";
  import { uiState, closeMenu } from "../../stores/ui.svelte";
  import {
    mixtapeModeState,
    mixtapeDraftHasContent,
    enterMixtapeMode,
    exitMixtapeMode,
  } from "../../stores/mixtape.svelte";

  import UserBalance from "./UserBalance.svelte";
  import MixtapeModeToggle from "./MixtapeModeToggle.svelte";
  import KaleEmoji from "../ui/KaleEmoji.svelte";

  const isAuthenticated = $derived(userState.contractId !== null);
  const currentPath = useCurrentPath();
  const path = $derived(currentPath.path);
  const authHook = useAuthentication();

  let creating = $state(false);
  let showKaleInfo = $state(false);

  async function handleLogin() {
    await authHook.login();
    closeMenu();
  }

  async function handleLogout() {
    await authHook.logout();
    closeMenu();
  }

  function handleMixtapeClick() {
    if (mixtapeModeState.active) {
      if (mixtapeDraftHasContent.current) {
        const confirmed = confirm("Exit Mixtape Mode? Draft saved locally.");
        if (!confirmed) return;
      }
      exitMixtapeMode();
    } else {
      enterMixtapeMode();
    }
    closeMenu();
  }
</script>

<div
  class="flex items-center mr-auto font-pixel tracking-wider text-[7px] xs:text-[9px] md:text-xs relative gap-1 md:gap-0"
>
  <h1 class="flex flex-col text-xl py-1 z-50">
    <a href="/" class="flex items-center gap-1">
      <span class="text-[#9ae600]">SMOL</span>
    </a>
  </h1>

  <!-- Top Row Visible Links -->
  <div class="flex items-center gap-1 md:gap-2 ml-1.5 md:ml-3 overflow-hidden">
    <a
      class="flex items-center gap-1 hover:text-[#9ae600] transition-colors {path ===
        '/artists' || path.startsWith('/artists/')
        ? 'text-white'
        : ''}"
      href="/artists">Artists</a
    >

    <a
      class="flex items-center gap-1 hover:text-[#9ae600] transition-colors {path ===
      '/created'
        ? 'text-white'
        : ''}"
      href="/created">Created</a
    >

    <a
      class="flex items-center gap-1 hover:text-[#9ae600] transition-colors {path ===
      '/radio'
        ? 'text-white'
        : ''}"
      href="/radio">Radio</a
    >

    <!-- Mobile Only: +Create -->
    <a
      class="flex md:hidden items-center gap-1 hover:text-[#9ae600] transition-colors whitespace-nowrap {path ===
      '/create'
        ? 'text-white'
        : ''}"
      href="/create">+CREATE</a
    >

    <!-- Desktop Only: Mixtapes -->
    <a
      class="hidden md:flex items-center gap-1 hover:text-[#9ae600] transition-colors whitespace-nowrap {path ===
        '/mixtapes' || path.startsWith('/mixtapes/')
        ? 'text-white'
        : ''}"
      href="/mixtapes">Mixtapes</a
    >

    <a
      class="hidden sm:flex items-center gap-1 hover:text-[#9ae600] transition-colors {path ===
      '/store'
        ? 'text-white'
        : ''}"
      href="/store">Store</a
    >

    <!-- Desktop Only: +CREATE -->
    <a
      class="hidden md:flex items-center gap-1 text-[#9ae600] hover:text-white transition-colors whitespace-nowrap {path ===
      '/create'
        ? 'text-white'
        : ''}"
      href="/create">+CREATE</a
    >
  </div>

  <!-- Dropdown Menu -->
  <div
    class={`
    ${uiState.isMenuOpen ? "flex" : "hidden"} 
    fixed top-[52px] right-0 p-4 menu-glass border-l border-b border-[#9ae600] flex-col gap-4 w-64 shadow-[-4px_4px_0px_0px_rgba(0,0,0,0.5)] z-[101]
  `}
  >
    <!-- 1. My Profile (Top Priority if Authenticated) -->
    {#if isAuthenticated}
      <a
        class="flex items-center gap-3 hover:text-[#9ae600] transition-colors {path ===
        '/created'
          ? 'text-white'
          : ''}"
        href="/created"
        onclick={closeMenu}
      >
        <span class="text-[#9ae600]">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"
            ><path
              d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"
            /></svg
          >
        </span>
        <span>My Profile</span>
      </a>
      <div class="h-px bg-slate-700/50 w-full"></div>
    {/if}

    <!-- 1b. Liked Songs (If Authenticated, or push to login if not? User implies it was hidden) -->
    <!-- Assuming this should be visible for quick access even if it prompts login, or only if auth. -->
    <!-- Based on "hidden liked menu", likely means for auth users. -->
    {#if isAuthenticated}
      <a
        class="flex items-center gap-3 hover:text-[#9ae600] transition-colors {path ===
        '/liked'
          ? 'text-white'
          : ''}"
        href="/liked"
        onclick={closeMenu}
      >
        <span class="text-[#f91880]">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            />
          </svg>
        </span>
        <span>Liked Songs</span>
      </a>
      <div class="h-px bg-slate-700/50 w-full"></div>
    {/if}

    <!-- 2. Browse Tags -->
    <a
      class="flex items-center gap-3 hover:text-[#9ae600] transition-colors {path ===
      '/tags'
        ? 'text-white'
        : ''}"
      href="/tags"
      onclick={closeMenu}
    >
      <span class="text-[#9ae600]">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"
          ><path
            d="M5.5,7A1.5,1.5 0 0,1 4,5.5A1.5,1.5 0 0,1 5.5,4A1.5,1.5 0 0,1 7,5.5A1.5,1.5 0 0,1 5.5,7M21.41,11.58L12.41,2.58C12.05,2.22 11.55,2 11,2H4C2.9,2 2,2.9 2,4V11C2,11.55 2.22,12.05 2.59,12.41L11.58,21.41C11.95,21.77 12.45,22 13,22C13.55,22 14.05,21.77 14.41,21.41L21.41,14.41C21.78,14.05 22,13.55 22,13C22,12.45 21.77,11.94 21.41,11.58Z"
          /></svg
        >
      </span>
      <span>Browse Tags</span>
    </a>

    <!-- 3. Store (Mobile) -->
    <a
      class="flex sm:hidden items-center gap-3 hover:text-[#9ae600] transition-colors {path ===
      '/store'
        ? 'text-white'
        : ''}"
      href="/store"
      onclick={closeMenu}
    >
      <span class="text-[#9ae600]">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"
          ><path
            d="M12,18H6V14H12M21,14V12L20,7H4L3,12V14H4V20H14V14H18V20H20V14M20,4H4V6H20V4Z"
          /></svg
        >
      </span>
      <span>Store</span>
    </a>

    <!-- What is KALE? Link -->
    <a
      class="flex items-center gap-3 hover:text-[#9ae600] transition-colors {path ===
      '/kale'
        ? 'text-white'
        : ''}"
      href="/kale"
      onclick={closeMenu}
    >
      <KaleEmoji size="w-4 h-4" />
      <span>What is KALE?</span>
    </a>

    <!-- Smol Labs -->
    <a
      class="flex items-center gap-3 hover:text-[#9ae600] transition-colors {path ===
      '/labs'
        ? 'text-white'
        : ''}"
      href="/labs"
      onclick={closeMenu}
    >
      <span class="text-[#f91880]">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M13,2V11H22V13H14.82C14.43,18.47 9.47,22 4,22V20C8.36,20 12.29,17.18 12.82,13H2V11H11V2H13Z"
          />
        </svg>
      </span>
      <span>Smol Labs</span>
    </a>

    <!-- 4. Mixtapes Browser + Tiny Mode Toggle -->
    <div class="flex items-center gap-2">
      <a
        class="flex items-center gap-3 hover:text-[#9ae600] transition-colors flex-1 {path ===
          '/mixtapes' || path.startsWith('/mixtapes/')
          ? 'text-white'
          : ''}"
        href="/mixtapes"
        onclick={closeMenu}
      >
        <span class="text-[#9ae600]">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"
            ><path
              d="M12,3V12.26C11.5,12.09 11,12 10.5,12C8,12 6,14 6,16.5S8,21 10.5,21C13,21 15,19 15,16.5V6H19V3H12Z"
            /></svg
          >
        </span>
        <span>Mixtapes</span>
      </a>
      {#if isAuthenticated}
        <button
          class="px-2 py-1 text-[8px] font-pixel rounded {mixtapeModeState.active
            ? 'bg-lime-400 text-slate-950'
            : 'text-lime-400 ring-1 ring-lime-400/40 hover:bg-lime-400/10'}"
          onclick={handleMixtapeClick}
          title={mixtapeModeState.active
            ? "Exit Mixtape Mode"
            : "Enter Mixtape Mode"}
        >
          {mixtapeModeState.active ? "✓" : "+"}
        </button>
      {/if}
    </div>

    <div class="h-px bg-slate-700/50 w-full"></div>

    <!-- 5. Balance & Logout -->
    {#if isAuthenticated}
      <div class="w-full mt-auto">
        {#if userState.contractId}
          <div class="flex flex-col gap-1 items-end">
            <span class="text-[8px] text-slate-500 lowercase">Balance</span>
            <UserBalance
              contractId={userState.contractId}
              balance={balanceState.balance}
              loading={balanceState.loading}
            />
          </div>
        {/if}
      </div>

      <button
        class="flex items-center justify-end w-full gap-3 text-red-500 hover:text-red-400 transition-colors text-right text-[10px] mt-4 underline"
        onclick={handleLogout}
      >
        <span>Logout Account</span>
      </button>
    {:else}
      <!-- Login -->
      <div class="h-px bg-slate-700/50 w-full my-2"></div>
      <button
        class="flex items-center justify-between w-full gap-3 hover:text-[#9ae600] transition-colors"
        onclick={() => {
          // Redirect to improved splash for clear Login vs Create choice
          window.location.href = "/onboarding/passkey";
          closeMenu();
        }}
      >
        <span class="text-[#9ae600]">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"
            ><path
              d="M10,17V14H3V10H10V7L15,12L10,17M10,2H19A2,2 0 0,1 21,4V20A2,2 0 0,1 19,22H10A2,2 0 0,1 8,20V18H10V20H19V4H10V6H8V4A2,2 0 0,1 10,2Z"
            /></svg
          >
        </span>
        <span>Login Account</span>
      </button>
    {/if}
  </div>
</div>
