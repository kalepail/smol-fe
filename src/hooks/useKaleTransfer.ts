import { kale } from '../utils/passkey-kit';
import { signAndSend, type SignAndSendResult } from '../utils/transaction-helpers';
import {
  validateAddress,
  validateAmount,
  validateSufficientBalance,
} from '../utils/transaction-validation';
import { wrapError } from '../utils/errors';

interface TransferParams {
  from: string;
  to: string;
  amount: bigint;
  keyId: string;
  turnstileToken: string;
}

interface TransferValidation {
  isValid: boolean;
  error?: string;
}

export function useKaleTransfer() {
  /**
   * Validate transfer parameters
   *
   * Uses centralized validation utilities for consistency
   */
  function validateTransfer(
    destination: string,
    amount: bigint | null,
    currentBalance: bigint | null,
    userContractId: string
  ): TransferValidation {
    try {
      // Validate destination address
      validateAddress(destination, 'Destination');

      // Check if sending to self
      if (destination === userContractId) {
        return { isValid: false, error: 'You already control this address.' };
      }

      // Validate amount
      validateAmount(amount, 'Transfer amount');

      // Validate sufficient balance
      validateSufficientBalance(amount!, currentBalance, 'Transfer amount');

      return { isValid: true };

    } catch (error) {
      const wrappedError = wrapError(error);
      return { isValid: false, error: wrappedError.getUserFriendlyMessage() };
    }
  }

  /**
   * Execute KALE transfer with unified sign-and-send pattern
   *
   * Uses transaction lock and balance update automatically
   */
  async function executeTransfer(params: TransferParams): Promise<SignAndSendResult> {
    try {
      // Build transfer transaction
      const tx = await kale.get().transfer({
        from: params.from,
        to: params.to,
        amount: params.amount,
      });

      // Sign and send with unified helper
      // Automatically: acquires lock, signs, sends, updates balance, releases lock
      return await signAndSend(tx, {
        keyId: params.keyId,
        turnstileToken: params.turnstileToken,
        updateBalance: true,
        contractId: params.from,
        useLock: true, // Prevent concurrent transfers
      });

    } catch (error) {
      const wrappedError = wrapError(error, 'Transfer failed');
      return { success: false, error: wrappedError.getUserFriendlyMessage() };
    }
  }

  return {
    validateTransfer,
    executeTransfer,
  };
}
