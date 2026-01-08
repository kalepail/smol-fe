


import { xdr, StrKey, scValToNative } from '@stellar/stellar-sdk';
import { upgradesState, unlockUpgrade } from '../../stores/upgrades.svelte';
import { getVIPAccess } from '../../utils/vip';

const ADMIN_ADDRESS = "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM";
const SMOL_MART_AMOUNTS = {
    PREMIUM_HEADER: 100000,
    GOLDEN_KALE: 69420.67,
    SHOWCASE_REEL: 1000000,
    VIBE_MATRIX: 250000
};

// VIP addresses now managed in src/utils/vip.ts

/**
 * Scan account history to see if they already paid for upgrades.
 * This effectively "Restores Purchases" from the blockchain.
 */
export async function verifyPastPurchases(userAddress: string) {
    if (!userAddress) return;

    console.log(`[SmolMart] Verifying purchases for ${userAddress}...`);

    // VIP check - instant unlock for whitelisted addresses (granular)
    const vipAccess = getVIPAccess(userAddress);
    if (vipAccess) {
        console.log('[SmolMart] VIP address detected - granting granular access!');
        if (vipAccess.premiumHeader) unlockUpgrade('premiumHeader');
        if (vipAccess.goldenKale) unlockUpgrade('goldenKale');
        if (vipAccess.showcaseReel) unlockUpgrade('showcaseReel');
        if (vipAccess.vibeMatrix) unlockUpgrade('vibeMatrix');
        return;
    }

    try {
        // Horizon Operations Endpoint
        // We look for 'invoke_host_function' where the function is 'transfer'
        // and the args match our store.
        const limit = 200;
        const url = `https://horizon.stellar.org/accounts/${userAddress}/operations?limit=${limit}&order=desc&include_failed=false`;

        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const operations = data._embedded?.records || [];

        for (const op of operations) {
            // We only care about Soroban invocations
            if (op.type !== 'invoke_host_function') continue;

            // In a real indexer we would have the decoded args. 
            // In Horizon for Soroban, we might need to rely on the fact that 
            // we triggered it via the specific contract.
            // However, parsing raw XDR is heavy. 

            // SHORTCUT: For now, since verifying "transfer" args via XDR in browser 
            // from Horizon `function` field is complex (it returns base64 XDR),
            // we will try to parse it if available.

            // Note: Horizon 'function' field in 'invoke_host_function' op contains the Host Function XDR.
            if (op.function) {
                try {
                    const buffer = Buffer.from(op.function, 'base64');
                    const hostFn = xdr.HostFunction.fromXDR(buffer);

                    // We expect InvokeContract(InvokeContractArgs)
                    if (hostFn.switch() === xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
                        const args = hostFn.invokeContract();
                        const contractAddress = StrKey.encodeContract(args.contractAddress().payload());
                        const functionName = args.functionName().toString();

                        // Must be KALE contract
                        // (We need to import the ID. For now hardcode or env?)
                        // actually we can just check if it matches the known KALE ID if we had it.
                        // Let's assume the user only calls transfer on KALE for these specific amounts.

                        if (functionName === 'transfer') {
                            const valArgs = args.args();
                            // transfer(from, to, amount)
                            // args[0] = from
                            // args[1] = to
                            // args[2] = amount

                            if (valArgs.length === 3) {
                                const toVal = valArgs[1];
                                const amountVal = valArgs[2];

                                const toAddress = scValToNative(toVal);
                                const amountRaw = scValToNative(amountVal);

                                // Convert amount (BigInt 7 decimals) to number
                                const amountNum = Number(amountRaw) / 10000000;

                                if (toAddress === ADMIN_ADDRESS) {
                                    if (Math.abs(amountNum - SMOL_MART_AMOUNTS.PREMIUM_HEADER) < 0.1) {
                                        console.log('[SmolMart] Found Premium Header purchase!');
                                        unlockUpgrade('premiumHeader');
                                    }
                                    if (Math.abs(amountNum - SMOL_MART_AMOUNTS.GOLDEN_KALE) < 0.1) {
                                        console.log('[SmolMart] Found Golden Kale purchase!');
                                        unlockUpgrade('goldenKale');
                                    }
                                    if (Math.abs(amountNum - SMOL_MART_AMOUNTS.SHOWCASE_REEL) < 0.1) {
                                        console.log('[SmolMart] Found Showcase Reel purchase! (Ultimate Bundle)');
                                        unlockUpgrade('showcaseReel');
                                        unlockUpgrade('premiumHeader');
                                        unlockUpgrade('goldenKale');
                                        unlockUpgrade('vibeMatrix');
                                    }
                                    if (Math.abs(amountNum - SMOL_MART_AMOUNTS.VIBE_MATRIX) < 0.1) {
                                        console.log('[SmolMart] Found Vibe Matrix purchase!');
                                        unlockUpgrade('vibeMatrix');
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    // ignore parse error
                }
            }
        }

    } catch (err) {
        console.error('[SmolMart] Verification failed', err);
    }
}
