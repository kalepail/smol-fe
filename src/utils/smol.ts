import { Client } from 'smol-sc-sdk';

export const XLM = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

const rpcUrl = 'https://soroban-testnet.stellar.org'
const contractId = 'CB5IYTNPLB5Z5ULQUDWMJECXDF2H2GOEUXHH43NWXGAT3XXH6NQ7ALF2'

export const smol = new Client({
    rpcUrl,
    contractId,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE
})