<script lang="ts">
  import { toastState, type Toast } from '../../stores/toast.svelte.ts';

  const toasts = $derived(toastState.toasts);

  function getToastStyles(type: Toast['type']) {
    const baseStyles = 'border-l-4';
    switch (type) {
      case 'success':
        return `${baseStyles} bg-green-900/90 border-green-500 text-green-100`;
      case 'error':
        return `${baseStyles} bg-red-900/90 border-red-500 text-red-100`;
      case 'warning':
        return `${baseStyles} bg-yellow-900/90 border-yellow-500 text-yellow-100`;
      default:
        return `${baseStyles} bg-blue-900/90 border-blue-500 text-blue-100`;
    }
  }

  function getIcon(type: Toast['type']) {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
    }
  }
</script>

<!-- Toast Container -->
<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
  {#each toasts as toast (toast.id)}
    <div
      class="pointer-events-auto max-w-md rounded-lg shadow-lg p-4 flex items-start gap-3 animate-slide-in {getToastStyles(toast.type)}"
      role="alert"
    >
      <span class="text-xl font-bold flex-shrink-0">{getIcon(toast.type)}</span>
      <p class="flex-1 text-sm leading-relaxed break-words">{toast.message}</p>
      <button
        onclick={() => toastState.dismiss(toast.id)}
        class="flex-shrink-0 text-lg opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  {/each}
</div>

<style>
  @keyframes slide-in {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .animate-slide-in {
    animation: slide-in 0.3s ease-out;
  }
</style>
