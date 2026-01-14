import { getDomain } from 'tldts';
import { kale, account, send } from '../utils/passkey-kit';
import { rpc } from '../utils/base';
import { updateContractBalance } from '../stores/balance.svelte';

interface TransferParams {
  from: string;
  to: string;
  amount: bigint;
  keyId: string;
}

interface TransferValidation {
  isValid: boolean;
  error?: string;
}

export function useKaleTransfer() {
  function validateTransfer(
    destination: string,
    amount: bigint | null,
    currentBalance: bigint | null,
    userContractId: string
  ): TransferValidation {
    if (!destination) {
      return { isValid: false, error: 'Enter a destination address.' };
    }

    if (destination === userContractId) {
      return { isValid: false, error: 'You already control this address.' };
    }

    if (!amount) {
      return { isValid: false, error: 'Enter a valid whole-number amount.' };
    }

    if (typeof currentBalance === 'bigint' && amount > currentBalance) {
      return { isValid: false, error: 'Amount exceeds available balance.' };
    }

    return { isValid: true };
  }

  async function executeTransfer(params: TransferParams): Promise<void> {
    let tx = await kale.transfer({
      from: params.from,
      to: params.to,
      amount: params.amount,
    });

    const { sequence } = await rpc.getLatestLedger();
    tx = await account.sign(tx, {
      rpId: getDomain(window.location.hostname) ?? undefined,
      keyId: params.keyId,
      expiration: sequence + 60,
    });

    await send(tx);

    await updateContractBalance(params.from);
  }

  return {
    validateTransfer,
    executeTransfer,
  };
}
