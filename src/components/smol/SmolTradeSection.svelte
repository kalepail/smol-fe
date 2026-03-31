<script lang="ts">
  import MintTradeModal from '../MintTradeModal.svelte';
  import { sac } from '../../utils/passkey-kit';
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

  // Fetch mint balance when token/user change
  $effect(() => {
    const token = mintTokenId;
    const user = userContractId;

    if (token && user) {
      if (token !== lastFetchedMintToken || user !== lastFetchedUser) {
        lastFetchedMintToken = token;
        lastFetchedUser = user;

        const client = sac.getSACClient(token);
        getTokenBalance(client, user)
          .then((balance) => {
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

  function handleClose() {
    show = false;
    onClose();
  }

  function handleComplete() {
    show = false;
    onComplete();
  }
</script>

{#if show}
  <MintTradeModal
    {ammId}
    {mintTokenId}
    {songId}
    title={title ?? undefined}
    imageUrl={imageUrl ?? undefined}
    on:close={handleClose}
    on:complete={handleComplete}
  />
{/if}
