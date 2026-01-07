/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║                  VIP ACCESS CONTROL CONFIGURATION                  ║
 * ║                                                                    ║
 * ║  Use this file to grant specific smol-mart upgrades to addresses.   ║
 * ║  This bypasses on-chain verification for these specific users.     ║
 * ╚════════════════════════════════════════════════════════════════════╝
 */

export interface VIPAccess {
    premiumHeader: boolean;
    goldenKale: boolean;
    showcaseReel: boolean;
}

export const VIP_CONFIG: Record<string, Partial<VIPAccess>> = {
    // noot.xlm - Full access by default
    "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM": {
        premiumHeader: true,
        goldenKale: true,
        showcaseReel: true
    },

    // Example: Grant only specific features to an address
    // "ADDRESS_HERE": {
    //     premiumHeader: true,
    //     goldenKale: false,
    //     showcaseReel: false
    // }
};

/**
 * Returns the upgrade access for a given address based on VIP status.
 * Returns null if the address is not a VIP.
 */
export function getVIPAccess(address: string): VIPAccess | null {
    if (!address) return null;

    const config = VIP_CONFIG[address];
    if (!config) return null;

    // Default any missing fields to false
    return {
        premiumHeader: config.premiumHeader ?? false,
        goldenKale: config.goldenKale ?? false,
        showcaseReel: config.showcaseReel ?? false
    };
}
