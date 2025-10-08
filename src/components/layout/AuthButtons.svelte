<script lang="ts">
  interface Props {
    isAuthenticated: boolean;
    creating: boolean;
    onLogin: () => Promise<void>;
    onSignUp: () => Promise<void>;
    onLogout: () => Promise<void>;
  }

  let { isAuthenticated, creating, onLogin, onSignUp, onLogout }: Props = $props();
</script>

{#if isAuthenticated}
  <button
    class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1"
    onclick={onLogout}>Logout</button
  >
{:else}
  <button class="mr-5 hover:underline" onclick={onLogin}>Login</button>
  <button
    class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1 disabled:opacity-50"
    onclick={onSignUp}
    disabled={creating}
    >{creating ? 'Creating...' : 'Create New Account'}</button
  >
{/if}
