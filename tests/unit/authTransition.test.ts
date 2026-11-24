import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthGeneration } from '../../src/utils/authTransition.ts';
import { notifyAuthTransition, subscribeAuthTransitions } from '../../src/services/api/auth.ts';

test('a newer login or a logout makes an in-flight login stale', () => {
  const auth = new AuthGeneration();
  const first = auth.begin();
  assert.equal(auth.isCurrent(first), true);

  const second = auth.begin();
  assert.equal(auth.isCurrent(first), false, 'a passkey prompt that resolves late must not commit');
  assert.equal(auth.isCurrent(second), true);

  auth.commit('jwt-2');
  assert.equal(auth.committed, 'jwt-2');

  const { ticket } = auth.signOut(async () => undefined);
  assert.equal(auth.isCurrent(second), false, 'logout supersedes the login');
  assert.equal(auth.isCurrent(ticket), true, 'the logout still owns the tab: it may navigate home');
  assert.equal(auth.committed, null, 'a stale POST /login response is put back to signed out');

  auth.begin();
  assert.equal(auth.isCurrent(ticket), false, 'a login started after logout cancels its redirect');
});

test('logout request runs after the synchronous sign-out, settles even on failure, and is awaited by the next login', async () => {
  const auth = new AuthGeneration();
  const events: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));

  const { done } = auth.signOut(async () => {
    events.push('logout:sent');
    await held;
    throw new Error('network');
  });
  events.push('signed-out-locally');
  const login = auth.logoutSettled().then(() => events.push('login:submit'));

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(events, ['signed-out-locally', 'logout:sent']);
  release();
  await done;
  await login;
  assert.deepEqual(events, ['signed-out-locally', 'logout:sent', 'login:submit']);
});

test('notifyAuthTransition reaches another tab via BroadcastChannel and storage; unsubscribe is idempotent', () => {
  const channels = new Set<FakeChannel>();
  class FakeChannel {
    onmessage: ((event: MessageEvent) => void) | null = null;
    name: string;
    constructor(name: string) {
      this.name = name;
      channels.add(this);
    }
    postMessage(data: unknown) {
      for (const peer of channels) if (peer !== this && peer.name === this.name) peer.onmessage?.({ data } as MessageEvent);
    }
    close() {
      channels.delete(this);
    }
  }
  const Ctor = FakeChannel as unknown as typeof BroadcastChannel;
  const storageListeners = new Set<(event: Event) => void>();
  const target = {
    addEventListener: (_: string, fn: (event: Event) => void) => storageListeners.add(fn),
    removeEventListener: (_: string, fn: (event: Event) => void) => storageListeners.delete(fn),
  } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>;
  const stored = new Map<string, string>();
  const storage = {
    setItem: (key: string, value: string) => {
      stored.set(key, value);
      for (const fn of storageListeners) fn({ key, newValue: value } as unknown as Event);
    },
  };

  let heard = 0;
  const unsubscribe = subscribeAuthTransitions(() => heard++, { BroadcastChannelCtor: Ctor, target });
  notifyAuthTransition({ storage, document: null, BroadcastChannelCtor: Ctor });
  assert.equal(heard, 2, 'storage event + BroadcastChannel message');
  assert.ok(stored.get('smol_auth_transition'), 'an opaque marker, never a token');

  unsubscribe();
  unsubscribe();
  assert.equal(channels.size, 0);
  notifyAuthTransition({ storage, document: null, BroadcastChannelCtor: Ctor });
  assert.equal(heard, 2);
});
