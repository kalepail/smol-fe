let kitPromise:
  | Promise<{
      kit: any;
      WalletNetwork: any;
    }>
  | null = null;

export async function loadWalletKit() {
  if (kitPromise) return kitPromise;

  kitPromise = (async () => {
    const { StellarWalletsKit, WalletNetwork, allowAllModules } = await import(
      "@creit.tech/stellar-wallets-kit"
    );
    const modules = allowAllModules();
    const kit = new StellarWalletsKit({
      modules,
      network: WalletNetwork.PUBLIC,
    });
    return { kit, WalletNetwork };
  })();

  return kitPromise;
}
