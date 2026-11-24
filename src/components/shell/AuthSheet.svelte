<script lang="ts">
  import { authSheetState, closeAuthSheet, type AuthSheetMode } from '../../stores/authSheet.svelte';
  import { useAuthentication } from '../../hooks/useAuthentication';
  import { toast } from '../../stores/toast.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Button from '../ui/Button.svelte';

  const authHook = useAuthentication();

  let mode = $state<AuthSheetMode>('signin');
  let username = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (authSheetState.open) {
      mode = authSheetState.mode;
      error = null;
    }
  });

  const modeOptions = [
    { value: 'signin' as const, label: 'Sign in' },
    { value: 'signup' as const, label: 'Create account' },
  ];

  async function handleSignIn() {
    error = null;
    submitting = true;
    try {
      const outcome = await authHook.login();
      if (outcome.committed) {
        toast.success('Signed in.');
        closeAuthSheet();
      } else {
        // A newer sign-in or a sign-out happened meanwhile and owns the session.
        error = 'Your session changed while signing in, so this sign-in was cancelled. Try again.';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not sign in with your passkey.';
    } finally {
      submitting = false;
    }
  }

  async function handleSignUp(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      error = 'Enter a username to create an account.';
      return;
    }
    error = null;
    submitting = true;
    try {
      const { committed } = await authHook.signUp(trimmed);
      username = '';
      if (committed) {
        toast.success('Account created.');
        closeAuthSheet();
      } else {
        mode = 'signin';
        error =
          'Your passkey wallet was created, but another tab changed your session. Sign in with your passkey to continue.';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not create your account.';
    } finally {
      submitting = false;
    }
  }
</script>

<Sheet
  open={authSheetState.open}
  title={mode === 'signin' ? 'Sign in to SMOL' : 'Create a SMOL account'}
  subtitle={authSheetState.reason ?? undefined}
  maxWidth="sm"
  dismissible={!submitting}
  onClose={closeAuthSheet}
>
  <div class="space-y-5">
    <SegmentedControl
      name="auth-mode"
      legend="Account action"
      options={modeOptions}
      bind:value={mode}
      onChange={() => {
        error = null;
      }}
    />

    {#if mode === 'signin'}
      <div class="space-y-4">
        <p class="text-sm leading-relaxed text-ink-2">
          Use the passkey saved on this device to sign in to your SMOL library and wallet.
        </p>

        {#if error}
          <p role="alert" class="rounded-[var(--radius-control)] bg-danger/15 px-3 py-2 text-sm text-danger ring-1 ring-inset ring-danger/35">
            {error}
          </p>
        {/if}

        <Button
          variant="primary"
          fullWidth
          loading={submitting}
          onclick={handleSignIn}
        >
          {submitting ? 'Signing in…' : 'Sign in with passkey'}
        </Button>
      </div>
    {:else}
      <form class="space-y-4" onsubmit={handleSignUp}>
        <label class="block">
          <span class="mb-1.5 block text-sm font-medium text-ink-1">Username</span>
          <input
            type="text"
            name="username"
            autocomplete="username"
            bind:value={username}
            placeholder="Pick a display name"
            disabled={submitting}
            class="input-ring min-h-11 w-full rounded-[var(--radius-control)] bg-surface-1 px-3 py-2.5 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3"
          />
        </label>

        <p class="text-xs leading-relaxed text-ink-2">
          Creates a Stellar smart wallet secured by your device passkey.
        </p>

        {#if error}
          <p role="alert" class="rounded-[var(--radius-control)] bg-danger/15 px-3 py-2 text-sm text-danger ring-1 ring-inset ring-danger/35">
            {error}
          </p>
        {/if}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={submitting}
          disabled={!username.trim()}
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    {/if}
  </div>
</Sheet>
