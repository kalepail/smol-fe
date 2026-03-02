
import { type ModuleInterface, ModuleType } from '@creit.tech/stellar-wallets-kit';
import { account } from '../../utils/passkey-kit';

export const SMOL_ID_MODULE: ModuleInterface = {
    productId: 'smol-id',
    productName: 'Smol ID 🥬',
    productUrl: 'https://smol.xyz',
    productIcon: 'https://smol.xyz/favicon.ico',
    moduleType: ModuleType.HW_WALLET,

    isAvailable: async () => {
        return true;
    },

    getAddress: async () => {
        const kit = await account.get();
        const address = await kit.getPublicKey();
        return { address };
    },

    signTransaction: async (xdr: string) => {
        const kit = await account.get();
        const signedTxXdr = await kit.sign(xdr);
        return { signedTxXdr };
    },

    signAuthEntry: async (authEntry: string) => {
        const kit = await account.get();
        const signedAuthEntry = await kit.signAuthEntry(authEntry);
        return { signedAuthEntry };
    },

    signMessage: async (message: string) => {
        const kit = await account.get();
        // PasskeyKit doesn't have signMessage? 
        // We can simulate with a dummy tx or just throw.
        // For MVP, just return it as is or throw not supported.
        throw new Error("signMessage not supported by Smol ID yet");
    },

    getNetwork: async () => {
        return {
            network: 'PUBLIC',
            networkPassphrase: 'Public Global Stellar Network ; September 2015'
        };
    }
};
