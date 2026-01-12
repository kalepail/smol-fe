import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;
const ADDRESS = "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM";
const READY_TIMEOUT_MS = 15000;
const SHUTDOWN_TIMEOUT_MS = 3000;

function waitForReady(process) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Dev server did not become ready in time."));
    }, READY_TIMEOUT_MS);

    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes("ready in") || text.includes("Local")) {
        cleanup();
        resolve();
      }
    };

    const onExit = (code) => {
      cleanup();
      reject(new Error(`Dev server exited early with code ${code}`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      process.stdout?.off("data", onData);
      process.stderr?.off("data", onData);
      process.off("exit", onExit);
    };

    process.stdout?.on("data", onData);
    process.stderr?.on("data", onData);
    process.on("exit", onExit);
  });
}

async function fetchArtist(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const body = await response.text();
  return { response, body };
}

test("artist route SSR renders shell with and without query params", async (t) => {
  const server = spawn(
    process.execPath,
    [
      "./node_modules/astro/astro.js",
      "dev",
      "--host",
      "localhost",
      "--port",
      String(PORT),
    ],
    {
      env: {
        ...process.env,
        ASTRO_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  await waitForReady(server);

  t.after(async () => {
    server.kill("SIGTERM");
    const exitPromise = once(server, "exit");
    await Promise.race([
      exitPromise,
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
    ]);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
      await once(server, "exit");
    }
  });

  const cases = [
    `/artist/${ADDRESS}`,
    `/artist/${ADDRESS}?shuffle=true&seed=1767826109542`,
  ];

  for (const path of cases) {
    const { response, body } = await fetchArtist(path);

    assert.equal(
      response.status,
      200,
      `Expected 200 response for ${path}, got ${response.status}`,
    );

    assert.match(
      body,
      /data-astro-source-file="[^"]*\/src\/pages\/artist\/\[address\]\.astro"/,
      `Expected SSR shell marker in response for ${path}`,
    );
  }
});
