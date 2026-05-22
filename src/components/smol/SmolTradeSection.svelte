<script lang="ts">
  import { getTokenBalance } from '../../utils/balance';
  import { logger } from '../../utils/logger';

  interface Props {
    show: boolean;
    songId: string;
    ammId: string;
    mintTokenId: string;
    title?: string | null;
    imageUrl?: string | null;
    userContractId?: string | null;
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
    userContractId = null,
    mintBalance = $bindable(),
    onClose,
    onComplete,
  }: Props = $props();

  // Track last fetched values to prevent duplicate balance fetches
  let lastFetchedMintToken = $state<string | null>(null);
  let lastFetchedUser = $state<string | null>(null);
  let TradeModal = $state<typeof import('../MintTradeModal.svelte').default | null>(null);

  // Fetch mint balance when token/user change
  $effect(() => {
    const token = mintTokenId;
    const user = userContractId;

    if (token && user) {
      if (token !== lastFetchedMintToken || user !== lastFetchedUser) {
        lastFetchedMintToken = token;
        lastFetchedUser = user;

        import('../../utils/passkey-kit')
          .then(({ sac }) => getTokenBalance(sac.getSACClient(token), user))
          .then((balance) => {
            if (token !== lastFetchedMintToken || user !== lastFetchedUser) return;
            mintBalance = balance;
          })
          .catch((error) => {
            logger.error('trade', 'Failed to fetch mint token balance:', error);
            mintBalance = 0n;
          });
      }
    } else {
      mintBalance = 0n;
      lastFetchedMintToken = null;
      lastFetchedUser = null;
    }
  });

  $effect(() => {
    if (!show || TradeModal) return;

    import('../MintTradeModal.svelte')
      .then((module) => {
        TradeModal = module.default;
      })
      .catch((error) => {
        logger.error('trade', 'Failed to load trade modal:', error);
      });
  });

  function handleClose() {
    show = false;
    onClose();
  }

  function handleComplete() {
    show = false;
    onComplete();
  }
</script>

{#if show && TradeModal}
  <TradeModal
    {ammId}
    {mintTokenId}
    {songId}
    title={title ?? undefined}
    imageUrl={imageUrl ?? undefined}
    on:close={handleClose}
    on:complete={handleComplete}
  />
{/if}
