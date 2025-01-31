import { Client } from 'smol-sc-sdk';

export const XLM = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

const rpcUrl = 'https://soroban-testnet.stellar.org'
const contractId = 'CDH7K6FUIGV3B2UEKHJK2REHBVHSLUJ2VNMUWRJ4EF2TXQXQQBEU4RA3'

export const smol = new Client({
    rpcUrl,
    contractId,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE
})