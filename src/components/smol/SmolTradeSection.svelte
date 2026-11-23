<script lang="ts">
  import { logger } from '../../utils/logger';

  interface Props {
    show: boolean;
    songId: string;
    ammId: string;
    mintTokenId: string;
    title?: string | null;
    imageUrl?: string | null;
    mintBalance: bigint;
    onClose: () => void;
    onComplete: () => void;
  }

  let {
    show = $bindable(),
    songId,
    ammId,
    mintTokenId,
    title = null,
    imageUrl = null,
    mintBalance = $bindable(),
    onClose,
    onComplete,
  }: Props = $props();

  let TradeModal = $state<typeof import('../MintTradeModal.svelte').default | null>(null);

  // Only load MintTradeModal (and passkey-kit / comet-sdk / Stellar SDK) when the user opens Trade.
  $effect(() => {
    if (!show || TradeModal) return;

    import('../MintTradeModal.svelte')
      .then((module) => {
        TradeModal = module.default;
      })
      .catch((error) => {
        logger.error('trade', 'Failed to load trade sheet:', error);
      });
  });

  function handleClose() {
    show = false;
    onClose();
  }

  function handleComplete(updatedMintBalance?: bigint) {
    if (typeof updatedMintBalance === 'bigint') {
      mintBalance = updatedMintBalance;
    }
    show = false;
    onComplete();
  }
</script>

{#if show && TradeModal}
  <TradeModal
    open={show}
    {ammId}
    {mintTokenId}
    {songId}
    title={title ?? undefined}
    imageUrl={imageUrl ?? undefined}
    onClose={handleClose}
    onComplete={handleComplete}
  />
{/if}
