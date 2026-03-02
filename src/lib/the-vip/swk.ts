
import {
    StellarWalletsKit,
    WalletNetwork,
    FreighterModule,
    xBullModule,
    AlbedoModule
} from '@creit.tech/stellar-wallets-kit';
import { SMOL_ID_MODULE } from './smol-id-module';

import {
    StellarWalletsKit,
    WalletNetwork,
    FreighterModule,
    xBullModule,
    AlbedoModule
} from '@creit.tech/stellar-wallets-kit';
import { SMOL_ID_MODULE } from './smol-id-module';

let _kit: StellarWalletsKit | null = null;

export const kit = new Proxy({} as StellarWalletsKit, {
    get(_target, prop) {
        if (typeof window === 'undefined') {
            return () => { throw new Error("StellarWalletsKit (kit) called on server"); };
        }
        if (!_kit) {
            _kit = new StellarWalletsKit({
                network: WalletNetwork.PUBLIC,
                selectedWalletId: "freighter",
                modules: [
                    SMOL_ID_MODULE,
                    new FreighterModule(),
                    new xBullModule(),
                    new AlbedoModule()
                ]
            });
        }
        return Reflect.get(_kit, prop);
    }
});
