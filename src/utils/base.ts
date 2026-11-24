import './bufferGlobal';
import { Server } from '@stellar/stellar-sdk/minimal/rpc';

export const rpc = new Server(import.meta.env.PUBLIC_RPC_URL);
