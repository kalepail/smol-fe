import { expect, test } from '@playwright/test';

const sampleSongId = 'a96760878f1cc19af6e190bed5c45fe55d4ea16d3c9f3d61db440a61e1ff4d87';

test.beforeEach(async ({ page }) => {
  // Avoid global onboarding redirects during navigation smoke tests.
  await page.addInitScript(() => {
    localStorage.setItem('smol_onboarding_complete', 'true');
  });
});

test('home navigation reaches radio builder', async ({ page }) => {
  // Block external API calls to force snapshot fallback and speed up test
  await page.route('**/api.smol.xyz/**', route => route.abort());

  await page.goto('/');

  const radioLink = page.getByRole('link', { name: 'Radio' });
  await expect(radioLink).toBeVisible();
  await radioLink.click({ force: true });

  await expect(page).toHaveURL(/\/radio/);
  await expect(page).toHaveURL(/\/radio/);
  await expect(page.getByRole('heading', { name: /SMOLRADIO/i })).toBeVisible();

  // Verify Audio Logic Fix: Only ONE audio element should exist (Global Player)
  // If duplicate existed (one in Layout, one in RadioPlayer), this would be > 1
  await expect(page.locator('audio')).toHaveCount(1);
});

test('song page includes MusicRecording schema with datePublished', async ({ page }) => {
  await page.goto(`/${sampleSongId}`);
  await page.waitForLoadState('domcontentloaded');

  const rawBlocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();

  const blocks = rawBlocks.flatMap((content) => {
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      return [] as Record<string, unknown>[];
    }
  });

  const recording = blocks.find(
    (block) => block['@type'] === 'MusicRecording',
  ) as { datePublished?: string } | undefined;

  expect(recording?.datePublished).toBeTruthy();
});

test('labs index includes restored pages and their routes load', async ({ page }) => {
  await page.goto('/labs', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('a[href="/labs/lastframe"]')).toBeVisible();
  await expect(page.locator('a[href="/labs/the-farm"]')).toBeVisible();
  await expect(page.locator('a[href="/labs/the-vip"]')).toBeVisible();

  await page.goto('/labs/lastframe', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1').filter({ hasText: /LASTFRAME/i })).toBeVisible();

  await page.goto('/labs/the-farm', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: '← Labs' })).toBeVisible();

  await page.goto('/labs/the-vip', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1').filter({ hasText: /THE VIP/i })).toBeVisible();
});

test('zkdungeon legacy routes redirect to /labs/the-farm/zkdungeon', async ({ page }) => {
  await page.goto('/zkdungeon', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/labs\/the-farm\/zkdungeon/);
  await expect(page.locator('.dungeon-game-wrapper')).toBeVisible();

  await page.goto('/labs/the-farm/dungeon-room', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/labs\/the-farm\/zkdungeon/);
});

test('zkdungeon solo floors 1-3 are learnable from policy tags (no guessing)', async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto('/labs/the-farm/zkdungeon', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'PLAY SOLO' })).toBeVisible();
  await page.getByRole('button', { name: 'PLAY SOLO' }).click();

  // Room 0: airlock (demo continues without wallet).
  await expect(page.getByRole('button', { name: 'ENTER INTAKE WING →' })).toBeVisible();
  // The airlock has long-form lore; ensure the primary action is in the viewport before clicking.
  await page.getByRole('button', { name: 'ENTER INTAKE WING →' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'ENTER INTAKE WING →' }).click();

  // Floor 1: choose an intentionally wrong door and validate forensic mismatch.
  await expect(page.locator('.dg-hud-floor')).toContainText('ROOM 1/3');
  const wrongDoor = page
    .locator('.dg-doors .dg-door')
    .filter({ has: page.locator('.dg-door-tag', { hasText: 'MIN ≥ 3' }) })
    .first();
  await wrongDoor.click();
  await expect(page.locator('.dg-forensics-outcome')).toContainText('ACCESS DENIED');
  await expect(page.locator('.dg-forensics-grid')).toContainText('Minimum Clearance');

  // Floor 1: now choose the compatible door (Tier 0 demo -> MIN ≥ 0).
  const f1Right = page
    .locator('.dg-doors .dg-door')
    .filter({ has: page.locator('.dg-door-tag', { hasText: 'MIN ≥ 0' }) })
    .first();
  await f1Right.click();
  await expect(page.locator('.dg-hud-floor')).toContainText('ROOM 2/3');

  // Floor 2: exact tier match (ROLE = 0).
  const f2Right = page
    .locator('.dg-doors .dg-door')
    .filter({ has: page.locator('.dg-door-tag', { hasText: 'ROLE = 0' }) })
    .first();
  await f2Right.click();
  await expect(page.locator('.dg-hud-floor')).toContainText('ROOM 3/3');

  // Floor 3: two-factor (MIN ≥ 0 + EVEN) for Tier 0.
  const f3Right = page
    .locator('.dg-doors .dg-door')
    .filter({ has: page.locator('.dg-door-tag', { hasText: 'MIN ≥ 0' }) })
    .filter({ has: page.locator('.dg-door-tag', { hasText: 'EVEN' }) })
    .first();
  await f3Right.click();
  // After room 3 clears, you should reach the ledger chamber.
  await expect(page.locator('.dg-stamp-title')).toContainText('WITHDRAWAL RECORD (MAINNET)');
});

test('labs crawl: /labs forward links are reachable', async ({ page }) => {
  // Block external API calls to avoid flaky dependencies.
  await page.route('**/api.smol.xyz/**', route => route.abort());

  const visited = new Set<string>();

  async function visit(href: string) {
    const url = href.split('#')[0];
    if (!url.startsWith('/labs')) return;
    if (visited.has(url)) return;
    visited.add(url);

    const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
    expect(res?.status() || 0).toBeLessThan(400);

    // Give client-only content a moment to render (Farm/VIP are heavily client-driven).
    await page.waitForTimeout(250);

    const forwardLinks = await page.$$eval('a[href^="/labs/"]', (anchors) =>
      anchors
        .map((a) => a.getAttribute('href') || '')
        .filter(Boolean)
        .map((h) => h.split('#')[0])
    );

    for (const next of Array.from(new Set(forwardLinks))) {
      if (next !== url) {
        await visit(next);
      }
    }
  }

  await visit('/labs');
});

test('the-farm noir verifier passes valid sample and fails tampered sample', async ({ page }) => {
  test.setTimeout(180_000);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  await page.goto('/labs/the-farm', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(250);

  type NoirEvalResult =
    | { ok: true; pass: { valid: boolean }; fail: { valid: boolean }; debugLogs: string[] }
    | { ok: false; error: string; debugLogs: string[] };

  let results: NoirEvalResult | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      results = await page.evaluate(
        async ({ internalTimeoutMs }) => {
          const debugLogs: string[] = [];
          const push = (msg: string) => debugLogs.push(`${Date.now()} ${msg}`);

          // Capture worker failures; bb.js waits for a "ready" message and can otherwise hang forever.
          const OriginalWorker = Worker;
          // @ts-ignore - Intentionally monkeypatching for diagnostics inside the browser context.
          window.Worker = function (...args) {
            const [url] = args;
            push(`Worker(new URL=${String(url)})`);
            // @ts-ignore
            const worker = new OriginalWorker(...args);
            worker.addEventListener('error', (event) => {
              // @ts-ignore
              const where = event?.filename
                ? ` at ${event.filename}:${event.lineno ?? '?'}:${event.colno ?? '?'}`
                : '';
              // @ts-ignore
              push(`Worker error: ${event.message || 'unknown'}${where}`);
              // @ts-ignore
              if (event?.error?.stack) push(`Worker stack: ${event.error.stack}`);
            });
            worker.addEventListener('messageerror', () => {
              push('Worker messageerror');
            });
            return worker;
          };

          const originalFetch = fetch.bind(window);
          window.fetch = async (...args) => {
            const [input] = args;
            push(`fetch ${String(input)}`);
            const res = await originalFetch(...args);
            push(`fetch ${String(input)} -> ${res.status}`);
            return res;
          };

          const originalCompile = WebAssembly.compile.bind(WebAssembly);
          WebAssembly.compile = async (bufferSource) => {
            // @ts-ignore
            const size = bufferSource?.byteLength ?? 0;
            push(`WebAssembly.compile start (${size} bytes)`);
            const mod = await originalCompile(bufferSource);
            push('WebAssembly.compile done');
            return mod;
          };

          push('import noirBundle');
          // @ts-ignore - Resolved by Vite in browser (dev server).
          const noirBundle = await import('/src/data/the-farm/noirBundle.ts');
          push('import noirVerifier');
          // @ts-ignore - Resolved by Vite in browser (dev server).
          const noirVerifier = await import('/src/lib/the-farm/verifiers/noir.ts');

          const validSample = noirBundle.noirSamples.find((s: any) => s.expectedValid);
          const invalidSample = noirBundle.noirSamples.find((s: any) => !s.expectedValid);

          if (!validSample || !invalidSample) {
            return { ok: false as const, error: 'Missing Noir samples', debugLogs };
          }

          const work = (async () => {
            push('verify PASS start');
            const pass = await noirVerifier.verifyNoirProof(
              noirBundle.noirVerifierBytecode,
              validSample.proof,
            );
            push('verify PASS done');

            push('verify FAIL start');
            const fail = await noirVerifier.verifyNoirProof(
              noirBundle.noirVerifierBytecode,
              invalidSample.proof,
            );
            push('verify FAIL done');

            return { ok: true as const, pass, fail, debugLogs };
          })();

          const timeout = new Promise((resolve) => {
            setTimeout(() => {
              resolve({ ok: false as const, error: 'Timed out running Noir verification', debugLogs });
            }, internalTimeoutMs);
          });

          return (await Promise.race([work, timeout])) as
            | { ok: true; pass: { valid: boolean }; fail: { valid: boolean }; debugLogs: string[] }
            | { ok: false; error: string; debugLogs: string[] };
        },
        { internalTimeoutMs: 30_000 },
      );

      if (!results.ok) {
        console.log('Noir browser verifier failed:', results.error);
        for (const line of results.debugLogs.slice(0, 80)) console.log('  ', line);
        throw new Error(results.error);
      }

      break;
    } catch (error) {
      if (`${error}`.includes('Execution context was destroyed')) {
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(250);
        continue;
      }

      throw error;
    }
  }

  if (!results) {
    throw new Error('Noir verifier eval did not complete (navigation kept resetting the page)');
  }

  if (!results.ok) {
    throw new Error(`Noir verifier failed: ${results.error}`);
  }

  const { pass, fail } = results;

  const expectedHydrationErrors = [...consoleErrors, ...pageErrors].filter((line) =>
    /Error hydrating|Failed to resolve module specifier|@aztec\/bb\.js/i.test(line),
  );
  expect(expectedHydrationErrors).toEqual([]);

  if (!pass.valid) {
    // Helps debug verifier wiring in CI logs.
    console.log('Noir PASS result:', pass);
    console.log('Noir FAIL result:', fail);
  }

  expect(pass.valid).toBeTruthy();
  expect(fail.valid).toBeFalsy();
});

test('the-farm circom inputs are scalar (no array / no comma string)', async ({ page }) => {
  test.setTimeout(60_000);

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/labs/the-farm', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(250);

  const result = await page.evaluate(async () => {
    // Avoid heavy Groth16 proving in e2e; we only validate the input shape passed to snarkjs.
    // @ts-ignore - Set a lightweight stub for the proof engine.
    window.snarkjs = {
      groth16: {
        fullProve: async (inputs: any) => {
          const keys = [
            'tier_id',
            'commitment_expected',
            'address_hash',
            'balance',
            'salt',
          ];
          for (const key of keys) {
            const value = inputs?.[key];
            if (Array.isArray(value)) throw new Error(`${key} must not be an array`);
            if (typeof value !== 'string') throw new Error(`${key} must be string, got ${typeof value}`);
            if (value.includes(',')) throw new Error(`${key} must not contain commas`);
            if (!/^[0-9]+$/.test(value)) throw new Error(`${key} must be digits, got "${value}"`);
          }
          return {
            proof: {
              pi_a: ['0', '0', '1'],
              pi_b: [['0', '0'], ['0', '0'], ['1', '0']],
              pi_c: ['0', '0', '1'],
              protocol: 'groth16',
              curve: 'bn254',
            },
            publicSignals: ['0', '0', '0'],
          };
        },
      },
    };

    // @ts-ignore - Resolved by Vite in browser (dev server).
    const mod = await import('/src/components/labs/the-farm/zkProof.ts');

    // Small, deterministic inputs. We only care that the input builder passes scalars.
    const proofRes = await mod.generateTierProof(0n, 2n, 0n, 0);
    return {
      ok: true,
      publicSignalsLen: proofRes.publicSignals?.length ?? 0,
    };
  });

  expect(result.ok).toBeTruthy();

  const circomInputErrors = consoleErrors.filter((line) =>
    /Too many values for input signal/i.test(line),
  );
  expect(circomInputErrors).toEqual([]);
});
