import type { VerificationResult } from "../types";
import {
  verify_receipt_json,
  verifier_version,
} from "../../../../zk/risc0-tier/verifier-wasm/pkg/risc0_receipt_verifier_wasm.js";

type WorkerRequest =
  | {
      id: number;
      type: "preload";
    }
  | {
      id: number;
      type: "verify";
      payload: {
        methodIdHex: string;
        receiptJson: string;
      };
    };

type WorkerResponse = {
  id: number;
  result: VerificationResult;
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const startedAt = performance.now();

  try {
    if (request.type === "preload") {
      verifier_version();
      const response: WorkerResponse = {
        id: request.id,
        result: {
          valid: true,
          durationMs: Math.round(performance.now() - startedAt),
        },
      };
      self.postMessage(response);
      return;
    }

    const valid = verify_receipt_json(
      request.payload.methodIdHex,
      request.payload.receiptJson,
    );
    const response: WorkerResponse = {
      id: request.id,
      result: {
        valid,
        durationMs: Math.round(performance.now() - startedAt),
        error: valid ? undefined : "RISC0 receipt verification returned false",
      },
    };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id: request.id,
      result: {
        valid: false,
        durationMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : "RISC0 receipt verification failed",
      },
    };
    self.postMessage(response);
  }
};
