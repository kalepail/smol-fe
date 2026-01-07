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

  const isAuthenticated = $derived(userState.contractId !== null);
  const currentPath = useCurrentPath();
  const path = $derived(currentPath.path);
  const authHook = useAuthentication();

  let creating = $state(false);

  async function handleLogin() {
    await authHook.login();
    closeMenu();
  }

  async function handleSignUp() {
    creating = true;
    try {
      const username = prompt("Enter your username");
      if (!username) throw new Error("Username is required");
      await authHook.signUp(username);
      closeMenu();
    } finally {
      creating = false;
    }
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
  class="flex items-center mr-auto font-pixel tracking-wider text-[10px] md:text-xs relative gap-2 md:gap-0"
>
  <h1 class="flex flex-col text-xl py-1 z-50">
    <a href="/" class="flex items-center gap-1">
      <span class="text-[#9ae600]">SMOL</span>
    </a>
  </h1>

  <!-- Top Row Visible Links -->
  <div class="flex items-center gap-2 md:gap-4 ml-2 md:ml-4 overflow-hidden">
    <a
      class="flex items-center gap-1 hover:text-[#9ae600] transition-colors {path ===
        '/artists' || path.startsWith('/artists/')
        ? 'text-white'
        : ''}"
      href="/artists">Artists</a
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
    fixed top-[52px] right-0 p-4 bg-slate-800 border-l border-b border-[#9ae600] flex-col gap-4 w-64 shadow-[-4px_4px_0px_0px_rgba(0,0,0,0.5)] z-[101]
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

    <div class="h-px bg-slate-700/50 w-full"></div>

    <!-- 3. Mixtape Mode Toggle (Mobile Only) -->
    {#if isAuthenticated}
      <div class="md:hidden">
        <div class="h-px bg-slate-700/50 w-full my-4"></div>
        <button
          class="flex items-center gap-3 w-full hover:text-[#9ae600] transition-colors"
          onclick={handleMixtapeClick}
        >
          <span class="text-[#9ae600]">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"
              />
            </svg>
          </span>
          <span
            >{mixtapeModeState.active
              ? "Exit Mixtape Mode"
              : "Enter Mixtape Mode"}</span
          >
          {#if !mixtapeModeState.active && mixtapeDraftHasContent.current}
            <span class="h-2 w-2 rounded-full bg-lime-400"></span>
          {/if}
        </button>
      </div>

      <div class="h-px bg-slate-700/50 w-full"></div>

      <!-- 5. Balance & Logout -->
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
          handleLogin();
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
