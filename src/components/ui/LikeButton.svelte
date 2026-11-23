<script lang="ts">
  import Loader from './Loader.svelte';
  import Icon from './Icon.svelte';
  import { userState } from '../../stores/user.svelte';
  import { toggleLike } from '../../utils/like';
  import { toast } from '../../stores/toast.svelte';
  import { logger } from '../../utils/logger';

  interface Props {
    smolId: string;
    liked?: boolean;
    classNames?: string;
    iconSize?: number;
    onLikeChanged?: (liked: boolean) => void;
  }

  let {
    smolId,
    liked = false,
    classNames = '',
    iconSize = 20,
    onLikeChanged,
  }: Props = $props();

  let liking = $state(false);
  let localLiked = $state(false);

  $effect(() => {
    localLiked = liked;
  });

  async function handleLike(event: MouseEvent) {
    event.stopPropagation();
    if (!userState.contractId || liking) return;

    try {
      liking = true;
      const newLikedState = await toggleLike(smolId, localLiked);
      localLiked = newLikedState;
      onLikeChanged?.(newLikedState);
    } catch (error) {
      logger.error('likes', 'Failed to toggle like:', error);
      toast.error(error instanceof Error ? error.message : 'Could not update like.');
    } finally {
      liking = false;
    }
  }
</script>

{#if userState.contractId}
  <button
    type="button"
    class={`focus-ring inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-50 ${
      localLiked ? 'text-accent' : 'text-ink-2 hover:text-ink-1'
    } ${classNames}`}
    aria-label={localLiked ? 'Unlike' : 'Like'}
    aria-pressed={localLiked}
    disabled={liking}
    onclick={handleLike}
  >
    {#if liking}
      <Loader classNames="size-4" />
    {:else if localLiked}
      <Icon name="heart-solid" size={iconSize} />
    {:else}
      <Icon name="heart" size={iconSize} />
    {/if}
  </button>
{/if}
