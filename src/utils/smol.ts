import { Client } from 'smol-sc-sdk';

export const XLM = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

const rpcUrl = 'https://soroban-testnet.stellar.org'
const contractId = 'CA3SPLLDBCOVZDDFAXNDNDBWH5E3ULRX5AL2MVQWOCGLJO7IGO5YHE7J'

export const smol = new Client({
    rpcUrl,
    contractId,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE
})