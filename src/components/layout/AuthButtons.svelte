<script lang="ts">
  interface Props {
    isAuthenticated: boolean;
    creating: boolean;
    onLogin: () => Promise<void>;
    onSignUp: () => Promise<void>;
    onLogout: () => Promise<void>;
  }

  let { isAuthenticated, creating, onLogin, onSignUp, onLogout }: Props =
    $props();
</script>

{#if isAuthenticated}
  <button
    class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1 font-pixel uppercase tracking-wider text-[10px]"
    onclick={onLogout}>Logout</button
  >
{:else}
  <button
    class="mr-3 md:mr-5 hover:text-[#9ae600] transition-colors font-pixel uppercase tracking-wider text-[10px]"
    onclick={onLogin}>Login</button
  >
  <button
    class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1 disabled:opacity-50 font-pixel uppercase tracking-wider text-[10px]"
    onclick={onSignUp}
    disabled={creating}
    >{creating ? "Creating..." : "Create New Account"}</button
  >
{/if}
