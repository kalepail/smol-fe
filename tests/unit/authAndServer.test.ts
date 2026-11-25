import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getSessionCookieDeleteOptions,
  parseSessionToken,
  readRawCookie,
  readSessionCookieFromRequest,
  resolveSessionCookie,
  resolveSessionCookieRead,
} from '../../src/utils/sessionToken.ts';
import {
  AUTH_EPOCH_COOKIE_NAME,
  AUTH_TRANSITION_STORAGE_KEY,
  buildAuthEpochCookieString,
  createAccountSession,
  notifyAuthTransition,
  observeAuthTransitions,
  readAuthEpochCookie,
  readAuthTransitionMarker,
  subscribeAuthTransitions,
  submitLogin,
  submitLogout,
} from '../../src/services/api/auth.ts';
import {
  serverApiFetch,
  serverApiFetchResult,
  sessionSubject,
  type ServerApiFetchContext,
} from '../../src/services/api/server.ts';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);

function makeJwt(payload: unknown, header: unknown = { alg: 'HS256', typ: 'JWT' }, sig = 'sig'): string {
  const hdr = Buffer.from(JSON.stringify(header)).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${hdr}.${body}.${sig}`;
}

// ---------------------------------------------------------------------------
// 1. useAuthentication / submitLogin / createAccountSession
// ---------------------------------------------------------------------------

test('submitLogin sends credentials: include on connect POST /login', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response('jwt-connect-token', { status: 200 });
  };

  const token = await submitLogin(
    'https://api.smol.xyz',
    {
      type: 'connect',
      keyId: 'key-123',
      contractId: 'CCONTRACT123',
      response: { id: 'key-123' },
    },
    fakeFetch,
  );

  assert.equal(token, 'jwt-connect-token');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.smol.xyz/login');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[0].init?.credentials, 'include');
  assert.deepEqual(calls[0].init?.headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    type: 'connect',
    keyId: 'key-123',
    contractId: 'CCONTRACT123',
    response: { id: 'key-123' },
  });
});

test('submitLogin sends credentials: omit on create POST /login so no provisional cookie installs pre-deploy', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response('jwt-create-token', { status: 200 });
  };

  const token = await submitLogin(
    'https://api.smol.xyz',
    {
      type: 'create',
      keyId: 'key-456',
      contractId: 'CCONTRACT456',
      response: { id: 'key-456' },
      username: 'alice',
    },
    fakeFetch,
  );

  assert.equal(token, 'jwt-create-token');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.smol.xyz/login');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[0].init?.credentials, 'omit');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    type: 'create',
    keyId: 'key-456',
    contractId: 'CCONTRACT456',
    response: { id: 'key-456' },
    username: 'alice',
  });
});

test('submitLogout sends POST /logout with credentials: include', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(null, { status: 204 });
  };

  await submitLogout('https://api.smol.xyz', fakeFetch);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.smol.xyz/logout');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[0].init?.credentials, 'include');
});

test('createAccountSession commits only after deploy succeeds and preserves competing tab logins', async () => {
  // 1. Happy path: login (credentials: omit) -> deploy -> commitSession
  const events: string[] = [];
  const fetchCalls: { url: string; init?: RequestInit }[] = [];
  const okFetch: typeof fetch = async (input, init) => {
    fetchCalls.push({ url: String(input), init });
    events.push(`fetch:${String(input)}`);
    return new Response('issued-jwt-1', { status: 200 });
  };

  const okRes = await createAccountSession({
    apiUrl: 'https://api.smol.xyz',
    payload: {
      type: 'create',
      keyId: 'k1',
      contractId: 'C1',
      response: { id: 'k1' },
      username: 'alice',
    },
    deployWallet: async () => {
      events.push('deployWallet');
    },
    readLiveCookieToken: () => null,
    commitSession: (jwt) => {
      events.push(`commit:${jwt}`);
    },
    fetchImpl: okFetch,
  });

  assert.deepEqual(okRes, { jwt: 'issued-jwt-1', committed: true });
  assert.deepEqual(events, [
    'fetch:https://api.smol.xyz/login',
    'deployWallet',
    'commit:issued-jwt-1',
  ]);
  assert.equal(fetchCalls[0].init?.credentials, 'omit');

  // 2. Relay/Turnstile failure -> never commits, never calls /logout
  let committedOnFail = false;
  await assert.rejects(
    createAccountSession({
      apiUrl: 'https://api.smol.xyz',
      payload: {
        type: 'create',
        keyId: 'k2',
        contractId: 'C2',
        response: { id: 'k2' },
        username: 'bob',
      },
      deployWallet: async () => {
        throw new Error('Relayer proxy error: Turnstile failed');
      },
      readLiveCookieToken: () => null,
      commitSession: () => {
        committedOnFail = true;
      },
      fetchImpl: okFetch,
    }),
    /Relayer proxy error: Turnstile failed/,
  );
  assert.equal(committedOnFail, false);

  // 3. Broken 2xx login body -> never deploys, never commits
  const brokenBodyFetch: typeof fetch = async () => {
    const brokenStream = new ReadableStream({
      start(controller) {
        controller.error(new Error('aborted 2xx login body'));
      },
    });
    return new Response(brokenStream, { status: 200 });
  };
  let deployedOnBroken = false;
  let committedOnBroken = false;
  await assert.rejects(
    createAccountSession({
      apiUrl: 'https://api.smol.xyz',
      payload: {
        type: 'create',
        keyId: 'k3',
        contractId: 'C3',
        response: { id: 'k3' },
        username: 'broken',
      },
      deployWallet: async () => {
        deployedOnBroken = true;
      },
      readLiveCookieToken: () => null,
      commitSession: () => {
        committedOnBroken = true;
      },
      fetchImpl: brokenBodyFetch,
    }),
    /aborted 2xx login body/,
  );
  assert.equal(deployedOnBroken, false);
  assert.equal(committedOnBroken, false);

  // 4. Another tab signed in while deployWallet was in flight -> committed: false, commitSession NOT called
  let liveCookie: string | null = null;
  let committedOverOther = false;
  const supersededRes = await createAccountSession({
    apiUrl: 'https://api.smol.xyz',
    payload: {
      type: 'create',
      keyId: 'k4',
      contractId: 'C4',
      response: { id: 'k4' },
      username: 'superseded',
    },
    deployWallet: async () => {
      liveCookie = 'other-tab-jwt';
    },
    readLiveCookieToken: () => liveCookie,
    commitSession: () => {
      committedOverOther = true;
    },
    fetchImpl: okFetch,
  });
  assert.deepEqual(supersededRes, { jwt: 'issued-jwt-1', committed: false });
  assert.equal(committedOverOther, false);

  // 5. Initial cookie captured BEFORE passkey prompt (null), Tab B signed in during prompt -> committed: false
  let committedOverPromptLogin = false;
  const promptSupersededRes = await createAccountSession({
    apiUrl: 'https://api.smol.xyz',
    payload: {
      type: 'create',
      keyId: 'k5',
      contractId: 'C5',
      response: { id: 'k5' },
      username: 'prompt-superseded',
    },
    deployWallet: async () => {},
    initialCookieToken: null,
    readLiveCookieToken: () => 'tab-b-prompt-jwt',
    commitSession: () => {
      committedOverPromptLogin = true;
    },
    fetchImpl: okFetch,
  });
  assert.deepEqual(promptSupersededRes, { jwt: 'issued-jwt-1', committed: false });
  assert.equal(committedOverPromptLogin, false);

  // 6. Tab B signed in AND signed out (both cookie snapshots are null) -> hasCompetingAuthEvent catches it
  let committedAfterSignOut = false;
  const signOutSupersededRes = await createAccountSession({
    apiUrl: 'https://api.smol.xyz',
    payload: {
      type: 'create',
      keyId: 'k6',
      contractId: 'C6',
      response: { id: 'k6' },
      username: 'signout-superseded',
    },
    deployWallet: async () => {},
    initialCookieToken: null,
    readLiveCookieToken: () => null,
    hasCompetingAuthEvent: () => true,
    commitSession: () => {
      committedAfterSignOut = true;
    },
    fetchImpl: okFetch,
  });
  assert.deepEqual(signOutSupersededRes, { jwt: 'issued-jwt-1', committed: false });
  assert.equal(committedAfterSignOut, false);

  // 7. Started signed in as old cookie, another origin/tab logged out (liveCookieNow === null) -> committed: false
  let committedAfterCookieDisappeared = false;
  const disappearedRes = await createAccountSession({
    apiUrl: 'https://api.smol.xyz',
    payload: {
      type: 'create',
      keyId: 'k7',
      contractId: 'C7',
      response: { id: 'k7' },
      username: 'disappeared-cookie',
    },
    deployWallet: async () => {},
    initialCookieToken: 'prior-jwt',
    readLiveCookieToken: () => null,
    commitSession: () => {
      committedAfterCookieDisappeared = true;
    },
    fetchImpl: okFetch,
  });
  assert.deepEqual(disappearedRes, { jwt: 'issued-jwt-1', committed: false });
  assert.equal(committedAfterCookieDisappeared, false);
});

test('notifyAuthTransition and observeAuthTransitions detect transitions via localStorage AND via BroadcastChannel under storage quota', () => {
  // 1. localStorage-only path (BroadcastChannel unavailable)
  const backing = new Map<string, string>();
  const storage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, v);
    },
  };
  const observerNoChannel = observeAuthTransitions({ storage, BroadcastChannelCtor: null });
  assert.equal(observerNoChannel.hasCompetingTransition(), false);
  const marker = notifyAuthTransition({ storage, BroadcastChannelCtor: null });
  assert.equal(backing.get(AUTH_TRANSITION_STORAGE_KEY), marker);
  assert.doesNotMatch(marker, /\./, 'transition marker must be non-secret opaque stamp, never a JWT');
  assert.equal(observerNoChannel.hasCompetingTransition(), true);
  observerNoChannel.close();

  // 2. BroadcastChannel path when localStorage throws QuotaExceededError
  const channels = new Set<FakeChannel>();
  let closedCount = 0;
  class FakeChannel {
    name: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor(name: string) {
      this.name = name;
      channels.add(this);
    }
    postMessage(data: unknown) {
      for (const peer of channels) {
        if (peer !== this && peer.name === this.name) {
          peer.onmessage?.({ data } as MessageEvent);
        }
      }
    }
    close() {
      channels.delete(this);
      closedCount += 1;
    }
  }
  const quotaStorage = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    },
  };

  const observerWithChannel = observeAuthTransitions({
    storage: quotaStorage,
    BroadcastChannelCtor: FakeChannel as unknown as typeof BroadcastChannel,
  });
  assert.equal(observerWithChannel.hasCompetingTransition(), false);

  notifyAuthTransition({
    storage: quotaStorage,
    BroadcastChannelCtor: FakeChannel as unknown as typeof BroadcastChannel,
  });
  assert.equal(observerWithChannel.hasCompetingTransition(), true);

  observerWithChannel.close();
  assert.equal(channels.size, 0);
  assert.equal(closedCount, 2);
});

test('smol_auth_epoch cookie scopes identically to smol_token and detects cross-origin transitions without storage or BroadcastChannel', () => {
  assert.equal(
    buildAuthEpochCookieString('1750000000-1-abc', 'smol.xyz', true),
    `${AUTH_EPOCH_COOKIE_NAME}=1750000000-1-abc; Path=/; SameSite=Lax; Max-Age=2592000; Domain=.smol.xyz; Secure`,
  );
  assert.equal(
    buildAuthEpochCookieString('1750000000-1-abc', 'next.smol.xyz', true),
    `${AUTH_EPOCH_COOKIE_NAME}=1750000000-1-abc; Path=/; SameSite=Lax; Max-Age=2592000; Domain=.smol.xyz; Secure`,
  );
  assert.equal(
    buildAuthEpochCookieString('1750000000-1-abc', '127.0.0.1', false),
    `${AUTH_EPOCH_COOKIE_NAME}=1750000000-1-abc; Path=/; SameSite=Lax; Max-Age=2592000`,
  );
  assert.equal(
    buildAuthEpochCookieString('1750000000-1-abc', 'localhost', false),
    `${AUTH_EPOCH_COOKIE_NAME}=1750000000-1-abc; Path=/; SameSite=Lax; Max-Age=2592000`,
  );
  assert.equal(
    buildAuthEpochCookieString('1750000000-1-abc', 'smol-fe.pages.dev', true),
    `${AUTH_EPOCH_COOKIE_NAME}=1750000000-1-abc; Path=/; SameSite=Lax; Max-Age=2592000; Secure`,
  );

  // Simulated shared cross-origin cookie jar (no shared localStorage, no BroadcastChannel)
  let sharedCookieHeader = '';
  const sharedDoc = {
    get cookie() {
      return sharedCookieHeader;
    },
    set cookie(assignment: string) {
      sharedCookieHeader = assignment.split(';')[0];
    },
  };

  const observer = observeAuthTransitions({
    storage: null,
    BroadcastChannelCtor: null,
    document: sharedDoc,
  });
  assert.equal(observer.startAuthEpoch, null);
  assert.equal(observer.hasCompetingTransition(), false);

  const marker = notifyAuthTransition({
    storage: null,
    BroadcastChannelCtor: null,
    document: sharedDoc,
    hostname: 'next.smol.xyz',
    isHttps: true,
  });
  assert.equal(readAuthEpochCookie(sharedDoc), marker);
  assert.equal(observer.hasCompetingTransition(), true);
  observer.close();
});

test('throwing globalThis.localStorage getter (SecurityError) never aborts auth transition helpers and preserves cookie + BroadcastChannel fallback', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('denied', 'SecurityError');
    },
  });

  try {
    assert.equal(readAuthTransitionMarker(), null);

    let sharedCookieHeader = '';
    const sharedDoc = {
      get cookie() {
        return sharedCookieHeader;
      },
      set cookie(assignment: string) {
        sharedCookieHeader = assignment.split(';')[0];
      },
    };

    const channels = new Set<FakeChannel>();
    class FakeChannel {
      name: string;
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(name: string) {
        this.name = name;
        channels.add(this);
      }
      postMessage(data: unknown) {
        for (const peer of channels) {
          if (peer !== this && peer.name === this.name) {
            peer.onmessage?.({ data } as MessageEvent);
          }
        }
      }
      close() {
        channels.delete(this);
      }
    }

    const observer = observeAuthTransitions({
      BroadcastChannelCtor: FakeChannel as unknown as typeof BroadcastChannel,
      document: sharedDoc,
    });
    assert.equal(observer.hasCompetingTransition(), false);

    const marker = notifyAuthTransition({
      BroadcastChannelCtor: FakeChannel as unknown as typeof BroadcastChannel,
      document: sharedDoc,
      hostname: '127.0.0.1',
      isHttps: false,
    });
    assert.equal(readAuthEpochCookie(sharedDoc), marker);
    assert.equal(observer.hasCompetingTransition(), true);
    observer.close();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  }
});

test('smol_auth_epoch alone does NOT trigger Layout private no-store or serverApiFetch cookie forwarding', async () => {
  const read = readSessionCookieFromRequest({
    request: { headers: new Headers({ cookie: `${AUTH_EPOCH_COOKIE_NAME}=1750000000-1-abc` }) },
  });
  assert.deepEqual(read, { present: false, value: undefined, malformedEncoding: false });
  assert.deepEqual(resolveSessionCookieRead(read, 'smol.xyz'), {
    cid: null,
    kid: null,
    shouldDeleteCookie: false,
    shouldSetNoStore: false,
    deleteCookieOptions: { path: '/', domain: '.smol.xyz' },
  });

  let receivedCookie: string | null = 'unset';
  const { ctx, responseHeaders } = makeAstroContext({
    rawCookieHeader: `${AUTH_EPOCH_COOKIE_NAME}=1750000000-1-abc`,
    bindingFetch: async (request) => {
      receivedCookie = request.headers.get('Cookie');
      return new Response(JSON.stringify({ id: 'public-song' }), { status: 200 });
    },
  });
  const data = await serverApiFetch<{ id: string }>(ctx, '/public-song', {
    forwardAuth: true,
    apiUrl: 'https://api.smol.xyz',
  });
  assert.deepEqual(data, { id: 'public-song' });
  assert.equal(receivedCookie, null);
  assert.equal(responseHeaders.get('Cache-Control'), null);
});

test('submitLogin propagates server error text and uses distinct fallbacks', async () => {
  const serverErrFetch: typeof fetch = async () => new Response('Invalid passkey', { status: 401 });
  await assert.rejects(
    submitLogin(
      'https://api.smol.xyz',
      { type: 'connect', keyId: 'k', contractId: 'c', response: {} },
      serverErrFetch,
    ),
    /Invalid passkey/,
  );

  const emptyErrFetch: typeof fetch = async () => new Response('', { status: 500 });
  await assert.rejects(
    submitLogin(
      'https://api.smol.xyz',
      { type: 'connect', keyId: 'k', contractId: 'c', response: {} },
      emptyErrFetch,
    ),
    /Sign in failed\./,
  );
  await assert.rejects(
    submitLogin(
      'https://api.smol.xyz',
      { type: 'create', keyId: 'k', contractId: 'c', response: {}, username: 'bob' },
      emptyErrFetch,
    ),
    /Account creation failed\./,
  );
});

test('useAuthentication routes connect via submitLogin, create via createAccountSession, preserves client cookie writes, and has no pendingSignup machinery', () => {
  const source = readFileSync(resolve(ROOT, 'src/hooks/useAuthentication.ts'), 'utf8');
  assert.match(source, /submitLogin\s*\(/);
  assert.match(source, /createAccountSession\s*\(/);
  assert.match(source, /submitLogout\s*\(/);
  assert.match(source, /type:\s*'connect'/);
  assert.match(source, /type:\s*'create'/);
  // Native helper (js-cookie removed, CVE-2026-46625): same set + both scoped removes (`sessionCookie.ts`).
  assert.match(source, /import \{ clearSessionCookies, setSessionCookie \} from '\.\.\/utils\/sessionCookie'/);
  const cookieSource = readFileSync(resolve(ROOT, 'src/utils/sessionCookie.ts'), 'utf8');
  assert.match(cookieSource, /setCookie\('smol_token'/);
  assert.equal(cookieSource.match(/removeCookie\('smol_token'/g)?.length, 2);
  assert.doesNotMatch(source + cookieSource, /js-cookie|Cookies\./);
  assert.doesNotMatch(source, /pendingSignup/);
  assert.equal(existsSync(resolve(ROOT, 'src/utils/pendingSignup.ts')), false);
});

// ---------------------------------------------------------------------------
// 2. Exception-safe cookie reader, full JWT envelope validation, & Layout policy
// ---------------------------------------------------------------------------

test('readRawCookie & readSessionCookieFromRequest handle absent, valid, and malformed percent-encoding without throwing', () => {
  assert.deepEqual(readRawCookie(null, 'smol_token'), {
    present: false,
    value: undefined,
    malformedEncoding: false,
  });
  assert.deepEqual(readRawCookie('other=1; theme=dark', 'smol_token'), {
    present: false,
    value: undefined,
    malformedEncoding: false,
  });
  assert.deepEqual(readRawCookie('other=1; smol_token=abc%2Edef; tail=2', 'smol_token'), {
    present: true,
    value: 'abc.def',
    malformedEncoding: false,
  });
  assert.deepEqual(readRawCookie('smol_token=', 'smol_token'), {
    present: true,
    value: '',
    malformedEncoding: false,
  });

  // Malformed percent-encoding (e.g. %E0%A4%A) must NEVER throw and must preserve present=true
  assert.deepEqual(readRawCookie('other=1; smol_token=%E0%A4%A', 'smol_token'), {
    present: true,
    value: undefined,
    malformedEncoding: true,
  });

  // Via Astro-like request object with malformed percent-encoding
  const fromReq = readSessionCookieFromRequest({
    request: { headers: new Headers({ cookie: 'smol_token=%E0%A4%A' }) },
    cookies: {
      get: () => {
        throw new URIError('URI malformed');
      },
    },
  });
  assert.deepEqual(fromReq, { present: true, value: undefined, malformedEncoding: true });

  // Via fallback cookies.get that throws URIError (simulating Astro 5.14.1 without request)
  const fromThrowingCookies = readSessionCookieFromRequest({
    cookies: {
      has: () => true,
      get: () => {
        throw new URIError('URI malformed');
      },
    },
  });
  assert.deepEqual(fromThrowingCookies, { present: true, value: undefined, malformedEncoding: true });

  // Layout resolution for malformed percent-encoding sets no-store + deletes cookie
  assert.deepEqual(resolveSessionCookieRead(fromReq, 'next.smol.xyz'), {
    cid: null,
    kid: null,
    shouldDeleteCookie: true,
    shouldSetNoStore: true,
    deleteCookieOptions: { path: '/', domain: '.smol.xyz' },
  });
});

test('parseSessionToken validates compact base64url envelope (header JSON object + signature) separately from payload expiry', () => {
  const now = 1_750_000_000;
  const validPayloadSeg = Buffer.from(
    JSON.stringify({ sub: 'CUSER1', key: 'key-1', exp: now + 3600 }),
  ).toString('base64url');
  const validHeaderSeg = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');

  // Sanity check: valid envelope + valid payload passes
  assert.deepEqual(
    parseSessionToken(`${validHeaderSeg}.${validPayloadSeg}.fixture-sig`, now),
    { contractId: 'CUSER1', keyId: 'key-1', exp: now + 3600 },
  );

  // Invalid header base64url alphabet / padding length (even with valid payload & sig)
  assert.equal(parseSessionToken(`a.${validPayloadSeg}.fixture-sig`, now), null);
  assert.equal(parseSessionToken(`bad+hdr.${validPayloadSeg}.fixture-sig`, now), null);
  assert.equal(parseSessionToken(`bad/hdr.${validPayloadSeg}.fixture-sig`, now), null);
  assert.equal(parseSessionToken(`${validHeaderSeg}=.${validPayloadSeg}.fixture-sig`, now), null);
  assert.equal(parseSessionToken(`bad!hdr.${validPayloadSeg}.fixture-sig`, now), null);

  // Invalid UTF-8 bytes in header (0xff 0xfe -> /_4 in base64url)
  const invalidUtf8Seg = Buffer.from([0xff, 0xfe]).toString('base64url');
  assert.equal(parseSessionToken(`${invalidUtf8Seg}.${validPayloadSeg}.fixture-sig`, now), null);

  // Non-JSON or non-object JSON header (even with valid payload & sig)
  const nonJsonHdr = Buffer.from('not-json').toString('base64url');
  assert.equal(parseSessionToken(`${nonJsonHdr}.${validPayloadSeg}.fixture-sig`, now), null);
  for (const badHeaderValue of [[], ['HS256'], 'JWT', 123, null, true]) {
    const seg = Buffer.from(JSON.stringify(badHeaderValue)).toString('base64url');
    assert.equal(
      parseSessionToken(`${seg}.${validPayloadSeg}.fixture-sig`, now),
      null,
      `non-object header ${JSON.stringify(badHeaderValue)} must be rejected`,
    );
  }

  // Invalid signature compact base64url syntax (even with valid header & payload)
  assert.equal(parseSessionToken(`${validHeaderSeg}.${validPayloadSeg}.`, now), null);
  assert.equal(parseSessionToken(`${validHeaderSeg}.${validPayloadSeg}.a`, now), null);
  assert.equal(parseSessionToken(`${validHeaderSeg}.${validPayloadSeg}.sig=`, now), null);
  assert.equal(parseSessionToken(`${validHeaderSeg}.${validPayloadSeg}.sig+1`, now), null);
  assert.equal(parseSessionToken(`${validHeaderSeg}.${validPayloadSeg}.sig/1`, now), null);
  assert.equal(parseSessionToken(`${validHeaderSeg}.${validPayloadSeg}.sig!`, now), null);
});

test('parseSessionToken accepts valid future numeric exp and rejects expired/malformed payloads', () => {
  const now = 1_750_000_000;

  const valid = parseSessionToken(makeJwt({ sub: 'CUSER1', key: 'key-1', exp: now + 1 }), now);
  assert.deepEqual(valid, { contractId: 'CUSER1', keyId: 'key-1', exp: now + 1 });

  // Boundary: exp === now is expired (strictly > now required)
  assert.equal(parseSessionToken(makeJwt({ sub: 'CUSER1', key: 'key-1', exp: now }), now), null);
  assert.equal(parseSessionToken(makeJwt({ sub: 'CUSER1', key: 'key-1', exp: now - 60 }), now), null);

  // Missing or non-numeric exp
  assert.equal(parseSessionToken(makeJwt({ sub: 'CUSER1', key: 'key-1' }), now), null);
  assert.equal(parseSessionToken(makeJwt({ sub: 'CUSER1', key: 'key-1', exp: String(now + 60) }), now), null);
  assert.equal(parseSessionToken(makeJwt({ sub: 'CUSER1', key: 'key-1', exp: null }), now), null);

  // Missing/empty sub or key
  assert.equal(parseSessionToken(makeJwt({ sub: '', key: 'key-1', exp: now + 60 }), now), null);
  assert.equal(parseSessionToken(makeJwt({ sub: 'CUSER1', key: '', exp: now + 60 }), now), null);
  assert.equal(parseSessionToken(makeJwt({ sub: 123, key: 'key-1', exp: now + 60 }), now), null);

  // Malformed shapes
  assert.equal(parseSessionToken('', now), null);
  assert.equal(parseSessionToken('not-a-jwt', now), null);
  assert.equal(parseSessionToken('only.two', now), null);
  assert.equal(parseSessionToken('a..c', now), null);
  assert.equal(parseSessionToken(`a.${Buffer.from('{bad-json').toString('base64url')}.sig`, now), null);
  assert.equal(parseSessionToken(`a.${Buffer.from('[]').toString('base64url')}.sig`, now), null);
});

test('getSessionCookieDeleteOptions sets .smol.xyz domain on smol.xyz hosts and omits on localhost/127.0.0.1', () => {
  assert.deepEqual(getSessionCookieDeleteOptions('smol.xyz'), { path: '/', domain: '.smol.xyz' });
  assert.deepEqual(getSessionCookieDeleteOptions('next.smol.xyz'), { path: '/', domain: '.smol.xyz' });
  assert.deepEqual(getSessionCookieDeleteOptions('NOOT.SMOL.XYZ'), { path: '/', domain: '.smol.xyz' });

  const localOpts = getSessionCookieDeleteOptions('localhost');
  assert.deepEqual(localOpts, { path: '/' });
  assert.equal('domain' in localOpts, false);

  const loopbackOpts = getSessionCookieDeleteOptions('127.0.0.1');
  assert.deepEqual(loopbackOpts, { path: '/' });
  assert.equal('domain' in loopbackOpts, false);

  const otherOpts = getSessionCookieDeleteOptions('evil-smol.xyz');
  assert.deepEqual(otherOpts, { path: '/' });
  assert.equal('domain' in otherOpts, false);
});

test('resolveSessionCookie handles absent, valid, expired, and malformed cookies with private no-store', () => {
  const now = 1_750_000_000;

  // Absent cookie -> unauthenticated, no deletion, no forced no-store
  assert.deepEqual(resolveSessionCookie(undefined, 'next.smol.xyz', now), {
    cid: null,
    kid: null,
    shouldDeleteCookie: false,
    shouldSetNoStore: false,
    deleteCookieOptions: { path: '/', domain: '.smol.xyz' },
  });

  // Valid cookie -> authenticated, no deletion, private no-store required
  const validJwt = makeJwt({ sub: 'CUSER1', key: 'key-1', exp: now + 3600 });
  assert.deepEqual(resolveSessionCookie(validJwt, 'next.smol.xyz', now), {
    cid: 'CUSER1',
    kid: 'key-1',
    shouldDeleteCookie: false,
    shouldSetNoStore: true,
    deleteCookieOptions: { path: '/', domain: '.smol.xyz' },
  });

  // Expired cookie on smol.xyz subdomain -> unauthenticated, delete with .smol.xyz, private no-store
  const expiredJwt = makeJwt({ sub: 'CUSER1', key: 'key-1', exp: now - 1 });
  assert.deepEqual(resolveSessionCookie(expiredJwt, 'next.smol.xyz', now), {
    cid: null,
    kid: null,
    shouldDeleteCookie: true,
    shouldSetNoStore: true,
    deleteCookieOptions: { path: '/', domain: '.smol.xyz' },
  });

  // Malformed cookie on 127.0.0.1 -> unauthenticated, delete without domain, private no-store
  assert.deepEqual(resolveSessionCookie('garbage', '127.0.0.1', now), {
    cid: null,
    kid: null,
    shouldDeleteCookie: true,
    shouldSetNoStore: true,
    deleteCookieOptions: { path: '/' },
  });

  // Empty cookie value present on request -> delete and private no-store
  assert.deepEqual(resolveSessionCookie('', 'localhost', now), {
    cid: null,
    kid: null,
    shouldDeleteCookie: true,
    shouldSetNoStore: true,
    deleteCookieOptions: { path: '/' },
  });
});

// ---------------------------------------------------------------------------
// 3. src/services/api/server.ts selective cookie forwarding, malformed cookie safety, & non-fallback
// ---------------------------------------------------------------------------

function makeAstroContext(opts: {
  cookie?: string;
  rawCookieHeader?: string;
  bindingFetch?: (request: Request) => Promise<Response>;
}): { ctx: ServerApiFetchContext; responseHeaders: Headers } {
  const responseHeaders = new Headers();
  const ctx: ServerApiFetchContext = {
    request:
      opts.rawCookieHeader !== undefined
        ? { headers: new Headers({ cookie: opts.rawCookieHeader }) }
        : undefined,
    locals: opts.bindingFetch
      ? { runtime: { env: { SMOL_API: { fetch: opts.bindingFetch } } } }
      : {},
    cookies: {
      has: (name: string) => name === 'smol_token' && opts.cookie !== undefined,
      get: (name: string) =>
        name === 'smol_token' && opts.cookie !== undefined ? { value: opts.cookie } : undefined,
    },
    response: { headers: responseHeaders },
  };
  return { ctx, responseHeaders };
}

test('serverApiFetch never forwards smol_token by default (public SSR routes)', async () => {
  let receivedCookie: string | null = 'unset';
  const { ctx, responseHeaders } = makeAstroContext({
    rawCookieHeader: 'smol_token=secret-jwt-token; other=1',
    cookie: 'secret-jwt-token',
    bindingFetch: async (request) => {
      receivedCookie = request.headers.get('Cookie');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  const data = await serverApiFetch<{ ok: boolean }>(ctx, '/mixtapes', {
    apiUrl: 'https://api.smol.xyz',
    fetchImpl: async () => {
      throw new Error('public fetch must not be called');
    },
  });

  assert.deepEqual(data, { ok: true });
  assert.equal(receivedCookie, null);
  assert.equal(responseHeaders.get('Cache-Control'), null);
});

test('serverApiFetch forwards smol_token and sets private no-store only when forwardAuth: true', async () => {
  let receivedCookie: string | null = null;
  const { ctx, responseHeaders } = makeAstroContext({
    rawCookieHeader: 'unrelated=abc; smol_token=secret-jwt-token',
    cookie: 'secret-jwt-token',
    bindingFetch: async (request) => {
      receivedCookie = request.headers.get('Cookie');
      return new Response(JSON.stringify({ id: 'private-1' }), { status: 200 });
    },
  });

  const data = await serverApiFetch<{ id: string }>(ctx, '/private-1', {
    forwardAuth: true,
    apiUrl: 'https://api.smol.xyz',
    fetchImpl: async () => {
      throw new Error('public fetch must not be called');
    },
  });

  assert.deepEqual(data, { id: 'private-1' });
  assert.equal(receivedCookie, 'smol_token=secret-jwt-token');
  assert.equal(responseHeaders.get('Cache-Control'), 'private, no-store');
});

test('serverApiFetch handles invalid percent-encoded smol_token safely without throwing, sets private no-store, and omits malformed Cookie header', async () => {
  let receivedCookie: string | null = 'unset';
  const { ctx, responseHeaders } = makeAstroContext({
    rawCookieHeader: 'smol_token=%E0%A4%A',
    bindingFetch: async (request) => {
      receivedCookie = request.headers.get('Cookie');
      return new Response(JSON.stringify({ id: 'public-song' }), { status: 200 });
    },
  });

  const data = await serverApiFetch<{ id: string }>(ctx, '/public-song', {
    forwardAuth: true,
    apiUrl: 'https://api.smol.xyz',
  });

  assert.deepEqual(data, { id: 'public-song' });
  assert.equal(receivedCookie, null);
  assert.equal(responseHeaders.get('Cache-Control'), 'private, no-store');
});

test('serverApiFetch stops immediately on every 4xx from SMOL_API binding without duplicate public HTTP fetch', async () => {
  for (const status of [400, 401, 403, 404, 410, 429]) {
    let publicFetchCalls = 0;
    const { ctx } = makeAstroContext({
      cookie: 'jwt-1',
      bindingFetch: async () => new Response(`err-${status}`, { status }),
    });

    const data = await serverApiFetch(ctx, `/song-${status}`, {
      forwardAuth: true,
      apiUrl: 'https://api.smol.xyz',
      fetchImpl: async () => {
        publicFetchCalls += 1;
        return new Response(JSON.stringify({ unexpected: true }), { status: 200 });
      },
    });

    assert.equal(data, null, `binding ${status} should return null`);
    assert.equal(publicFetchCalls, 0, `binding ${status} must NOT fall back to public HTTP fetch`);
  }
});

test('serverApiFetch treats body.cancel() rejection on a 503 binding response as best-effort and resolves to null', async () => {
  let publicFetchCalls = 0;
  let cancelCalled = false;
  const failingBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
    },
    cancel() {
      cancelCalled = true;
      return Promise.reject(new Error('stream already locked or broken'));
    },
  });

  const { ctx } = makeAstroContext({
    bindingFetch: async () => new Response(failingBody, { status: 503 }),
  });

  const data = await serverApiFetch(ctx, '/broken-upstream', {
    apiUrl: 'https://api.smol.xyz',
    fetchImpl: async () => {
      publicFetchCalls += 1;
      return new Response(JSON.stringify({ unexpected: true }), { status: 200 });
    },
  });

  assert.equal(cancelCalled, true);
  assert.equal(data, null);
  assert.equal(publicFetchCalls, 0);
});

test('serverApiFetch falls back to public HTTP fetch ONLY when binding is absent or throws transport error', async () => {
  // 1. Transport error from binding -> falls back
  let fallbackCalls = 0;
  let fallbackCookie: string | null = null;
  const { ctx: errCtx } = makeAstroContext({
    cookie: 'jwt-fallback',
    bindingFetch: async () => {
      throw new TypeError('service binding transport failure');
    },
  });

  const recovered = await serverApiFetch<{ ok: boolean }>(errCtx, '/first-smol', {
    forwardAuth: true,
    apiUrl: 'https://api.smol.xyz',
    fetchImpl: async (_input, init) => {
      fallbackCalls += 1;
      fallbackCookie = new Headers(init?.headers).get('Cookie');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  assert.deepEqual(recovered, { ok: true });
  assert.equal(fallbackCalls, 1);
  assert.equal(fallbackCookie, 'smol_token=jwt-fallback');

  // 2. Absent binding (local dev) -> uses public HTTP fetch, still respects forwardAuth: false
  let localCalls = 0;
  let localCookie: string | null = 'unset';
  const { ctx: localCtx } = makeAstroContext({ cookie: 'jwt-local' });

  const localData = await serverApiFetch<{ items: number[] }>(localCtx, '/mixtapes', {
    apiUrl: 'http://127.0.0.1:4329',
    fetchImpl: async (_input, init) => {
      localCalls += 1;
      localCookie = new Headers(init?.headers).get('Cookie');
      return new Response(JSON.stringify({ items: [1, 2] }), { status: 200 });
    },
  });

  assert.deepEqual(localData, { items: [1, 2] });
  assert.equal(localCalls, 1);
  assert.equal(localCookie, null);
});

test('serverApiFetchResult and sessionSubject are exception-safe on malformed cookies, default to forwardAuth: false, and reject expired JWTs', async () => {
  // sessionSubject: malformed percent-encoding never throws, expired JWT returns null, valid JWT returns sub
  assert.equal(
    sessionSubject({
      request: { headers: new Headers({ cookie: 'smol_token=%E0%A4%A' }) },
      cookies: {
        get: () => {
          throw new URIError('URI malformed');
        },
      },
    }),
    null,
  );
  const now = Math.floor(Date.now() / 1000);
  assert.equal(
    sessionSubject({
      request: { headers: new Headers({ cookie: `smol_token=${makeJwt({ sub: 'CEXP', key: 'k', exp: now - 60 })}` }) },
    }),
    null,
  );
  assert.equal(
    sessionSubject({
      request: { headers: new Headers({ cookie: `smol_token=${makeJwt({ sub: 'COK', key: 'k', exp: now + 3600 })}` }) },
    }),
    'COK',
  );

  // serverApiFetchResult: default forwardAuth: false never forwards smol_token and never falls back on binding 503
  let receivedCookie: string | null = 'unset';
  let publicFetchCalls = 0;
  const { ctx, responseHeaders } = makeAstroContext({
    rawCookieHeader: 'smol_token=secret-jwt-token',
    bindingFetch: async (request) => {
      receivedCookie = request.headers.get('Cookie');
      return new Response('unavailable', { status: 503 });
    },
  });
  const res503 = await serverApiFetchResult(ctx, '/mixtapes/public-1', {
    apiUrl: 'https://api.smol.xyz',
    fetchImpl: async () => {
      publicFetchCalls += 1;
      return new Response(JSON.stringify({ unexpected: true }), { status: 200 });
    },
  });
  assert.deepEqual(res503, { status: 503, data: null });
  assert.equal(receivedCookie, null);
  assert.equal(responseHeaders.get('Cache-Control'), null);
  assert.equal(publicFetchCalls, 0);
});

test('SSR pages only opt into forwardAuth on authenticated endpoints (/[id] and /mixtapes/mine), never public endpoints', () => {
  const songPage = readFileSync(resolve(ROOT, 'src/pages/[id].astro'), 'utf8');
  assert.match(songPage, /forwardAuth:\s*true/, '/[id].astro must forward auth for private songs');

  // Mixtape pages forward auth ONLY on authenticated /mixtapes/mine, never on public /mixtapes or /mixtapes/:id
  const mixtapesIndex = readFileSync(resolve(ROOT, 'src/pages/mixtapes/index.astro'), 'utf8');
  assert.match(mixtapesIndex, /'\/mixtapes\/mine',\s*\{\s*forwardAuth:\s*true\s*\}/);
  assert.doesNotMatch(mixtapesIndex, /'\/mixtapes',\s*\{[^}]*forwardAuth/);

  const mixtapesDetail = readFileSync(resolve(ROOT, 'src/pages/mixtapes/[id].astro'), 'utf8');
  assert.match(mixtapesDetail, /'\/mixtapes\/mine',\s*\{\s*forwardAuth:\s*true\s*\}/);
  assert.doesNotMatch(mixtapesDetail, /serverApiFetchResult<[^>]+>\([^;]*forwardAuth/);

  const publicPages = [
    'src/pages/artists/[address].astro',
    'src/pages/playlist/[playlist].astro',
  ];
  for (const relPath of publicPages) {
    const content = readFileSync(resolve(ROOT, relPath), 'utf8');
    assert.doesNotMatch(content, /forwardAuth/, `${relPath} must not forward smol_token`);
  }
});

test('subscribeAuthTransitions fires on another tab\'s BroadcastChannel or storage transition, and unsubscribes cleanly (Report 49 P2-4)', () => {
  const channels = new Set<FakeChannel>();
  class FakeChannel {
    name: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor(name: string) {
      this.name = name;
      channels.add(this);
    }
    postMessage(data: unknown) {
      for (const peer of channels) {
        if (peer !== this && peer.name === this.name) peer.onmessage?.({ data } as MessageEvent);
      }
    }
    close() {
      channels.delete(this);
    }
  }
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const target = {
    addEventListener: (type: string, fn: (event: Event) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (event: Event) => void) => listeners.get(type)?.delete(fn),
  } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>;
  const emitStorage = (key: string) => {
    for (const fn of listeners.get('storage') ?? []) fn({ key } as unknown as Event);
  };

  let fired = 0;
  const unsubscribe = subscribeAuthTransitions(() => fired++, {
    BroadcastChannelCtor: FakeChannel as unknown as typeof BroadcastChannel,
    target,
  });
  notifyAuthTransition({
    storage: null,
    document: null,
    BroadcastChannelCtor: FakeChannel as unknown as typeof BroadcastChannel,
  });
  assert.equal(fired, 1, 'BroadcastChannel transition');
  emitStorage('unrelated');
  assert.equal(fired, 1);
  emitStorage(AUTH_TRANSITION_STORAGE_KEY);
  assert.equal(fired, 2, 'storage transition');

  unsubscribe();
  unsubscribe();
  assert.equal(channels.size, 0);
  assert.equal(listeners.get('storage')?.size, 0);
  emitStorage(AUTH_TRANSITION_STORAGE_KEY);
  assert.equal(fired, 2);
});
