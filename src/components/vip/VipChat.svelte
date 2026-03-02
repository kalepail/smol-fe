<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { VIP_API_BASE, HISTORY_LIMIT } from "../../lib/vip/config";
  import {
    type ClientKeyBundle,
    decryptWithSenderKey,
    encryptWithSenderKey,
    exportPublicBundle,
    maybeRotateSenderKey,
    signPayload,
    wrapSenderKeyForPeer,
  } from "../../lib/vip/e2ee/protocol";
  import {
    base64ToBuf,
    encodeUtf8,
    importPublicKeyRaw,
    shortKey,
  } from "../../lib/vip/e2ee/keys";

  type RosterEntry = {
    account: string;
    e2ee: { identity: string; dh: string };
    id: string;
  };

  type Incoming =
    | { kind: "sender-key-share"; from: string; to: string; wrappedKey: string; nonce: string; keyVersion: number; ts: number; seq?: number }
    | { kind: "chat"; sender: string; ciphertext: string; nonce: string; keyVersion: number; signature: string; ts: number; seq?: number }
    | { kind: "system"; message: string; ts: number; seq?: number };

  interface Props {
    roomId: string;
    token: string;
    account: string;
    bundle: ClientKeyBundle;
    rotation?: { messages: number; minutes: number };
  }

  let {
    roomId,
    token,
    account,
    bundle,
    rotation = { messages: 20, minutes: 10 },
  }: Props = $props();

  let status = $state<"joining" | "connected" | "blocked" | "disconnected">(
    "joining"
  );
  let roster = $state<RosterEntry[]>([]);
  let messages = $state<Array<{ sender: string; body: string; ts: number }>>([]);
  let senderKeys = $state<Record<string, ClientKeyBundle["sender"]>>({});
  let sharedVersionByPeer = $state<Record<string, number>>({});
  let pending = $state(false);
  let input = $state("");
  let error = $state<string | null>(null);
  let cursor = $state(0);
  let polling = false;

  const MAX_MESSAGES = HISTORY_LIMIT;
  const identityKeyCache = new Map<string, CryptoKey>();

  function reset() {
    status = "disconnected";
    roster = [];
    messages = [];
    senderKeys = {};
    sharedVersionByPeer = {};
    cursor = 0;
    error = null;
  }

  async function apiFetch(path: string, init: RequestInit) {
    const res = await fetch(`${VIP_API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res;
  }

  async function joinRoom() {
    reset();
    status = "joining";
    try {
      const publicBundle = await exportPublicBundle(bundle);
      const res = await apiFetch(`/rooms/${encodeURIComponent(roomId)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, e2ee: publicBundle }),
      });
      const data = (await res.json()) as { roster?: RosterEntry[]; cursor?: number };
      roster = Array.isArray(data.roster) ? data.roster : [];
      cursor = typeof data.cursor === "number" ? data.cursor : 0;
      senderKeys[account] = bundle.sender;
      status = "connected";
      await sendKeyShares(roster);
    } catch (err: any) {
      console.error(err);
      error = err?.message || "Unable to join VIP room";
      status = "blocked";
    }
  }

  async function pollEvents() {
    if (polling || status !== "connected") return;
    polling = true;
    try {
      const res = await apiFetch(
        `/rooms/${encodeURIComponent(roomId)}/events?cursor=${encodeURIComponent(
          String(cursor)
        )}`,
        { method: "GET" }
      );
      const data = (await res.json()) as {
        roster?: RosterEntry[];
        events?: Incoming[];
        cursor?: number;
      };

      const nextRoster = Array.isArray(data.roster) ? data.roster : [];
      roster = nextRoster;

      const events = Array.isArray(data.events) ? data.events : [];
      for (const evt of events) {
        await handleIncoming(evt);
      }

      cursor = typeof data.cursor === "number" ? data.cursor : cursor;

      // Ensure new peers get our current sender key.
      await sendKeyShares(roster);
    } catch (err) {
      console.warn("[vip] poll failed", err);
    } finally {
      polling = false;
    }
  }

  async function sendEvent(evt: Incoming) {
    await apiFetch(`/rooms/${encodeURIComponent(roomId)}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evt),
    });
  }

  async function sendKeyShares(currentRoster: RosterEntry[]) {
    for (const peer of currentRoster) {
      if (peer.account === account) continue;
      if (sharedVersionByPeer[peer.account] === bundle.sender.version) continue;

      const share = await wrapSenderKeyForPeer(bundle, peer.e2ee.dh);
      await sendEvent({
        kind: "sender-key-share",
        from: account,
        to: peer.account,
        wrappedKey: share.wrappedKey,
        nonce: share.nonce,
        keyVersion: share.keyVersion,
        ts: Date.now(),
      });
      sharedVersionByPeer = {
        ...sharedVersionByPeer,
        [peer.account]: bundle.sender.version,
      };
    }

    senderKeys[account] = bundle.sender;
  }

  async function importSharedFromPeer(
    peerDh: string,
    wrapped: string,
    nonce: string,
    keyVersion: number
  ) {
    const shared = await crypto.subtle.deriveKey(
      {
        name: "ECDH",
        public: await crypto.subtle.importKey(
          "raw",
          base64ToBuf(peerDh),
          { name: "ECDH", namedCurve: "P-256" },
          true,
          []
        ),
      },
      bundle.dh.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const keyBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuf(nonce) },
      shared,
      base64ToBuf(wrapped)
    );
    const key = await crypto.subtle.importKey(
      "raw",
      keyBuf,
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );
    return {
      key,
      version: keyVersion,
      rotatedAt: Date.now(),
      sentCount: 0,
    };
  }

  async function verifyChatSignature(evt: Extract<Incoming, { kind: "chat" }>): Promise<boolean> {
    const peer = roster.find((r) => r.account === evt.sender);
    if (!peer) return false;

    let key = identityKeyCache.get(peer.account);
    if (!key) {
      key = await importPublicKeyRaw(peer.e2ee.identity, { name: "ECDSA", namedCurve: "P-256" }, ["verify"]);
      identityKeyCache.set(peer.account, key);
    }

    const sigBytes = encodeUtf8(
      `${roomId}|${evt.ciphertext}|${evt.nonce}|${evt.keyVersion}|${evt.ts}`
    );
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64ToBuf(evt.signature),
      sigBytes
    );
  }

  async function handleIncoming(evt: Incoming) {
    if (evt.kind === "system") {
      messages = [
        ...messages.slice(-MAX_MESSAGES + 1),
        { sender: "system", body: evt.message, ts: evt.ts },
      ];
      return;
    }

    if (evt.kind === "sender-key-share") {
      if (evt.to !== account && evt.to !== "all") return;
      const peer = roster.find((r) => r.account === evt.from);
      if (!peer) return;
      try {
        const derived = await importSharedFromPeer(
          peer.e2ee.dh,
          evt.wrappedKey,
          evt.nonce,
          evt.keyVersion
        );
        senderKeys[evt.from] = derived;
      } catch (err) {
        console.warn("[vip] key unwrap failed", err);
      }
      return;
    }

    if (evt.kind === "chat") {
      const sigOk = await verifyChatSignature(evt);
      if (!sigOk) {
        messages = [
          ...messages.slice(-MAX_MESSAGES + 1),
          {
            sender: "system",
            body: `Dropped message: invalid signature from ${shortKey(evt.sender)}`,
            ts: Date.now(),
          },
        ];
        return;
      }

      const senderKey = senderKeys[evt.sender];
      if (!senderKey) return;

      try {
        const text = await decryptWithSenderKey(senderKey, evt.ciphertext, evt.nonce);
        messages = [
          ...messages.slice(-MAX_MESSAGES + 1),
          { sender: evt.sender, body: text, ts: evt.ts },
        ];
      } catch (err) {
        console.warn("[vip] decrypt failed", err);
      }
    }
  }

  async function sendMessage() {
    if (status !== "connected") return;
    if (!input.trim()) return;
    pending = true;
    try {
      const prevVersion = bundle.sender.version;
      bundle = await maybeRotateSenderKey(bundle, {
        maxMessages: rotation.messages,
        maxMinutes: rotation.minutes,
      });

      if (bundle.sender.version !== prevVersion) {
        senderKeys[account] = bundle.sender;
        await sendKeyShares(roster);
      }

      const plaintext = input.trim();
      const { ciphertext, nonce, keyVersion } = await encryptWithSenderKey(bundle.sender, plaintext);
      const ts = Date.now();
      const sigBytes = encodeUtf8(`${roomId}|${ciphertext}|${nonce}|${keyVersion}|${ts}`);
      const signature = await signPayload(bundle.identity, sigBytes);

      await sendEvent({
        kind: "chat",
        sender: account,
        ciphertext,
        nonce,
        keyVersion,
        signature,
        ts,
      });

      messages = [
        ...messages.slice(-MAX_MESSAGES + 1),
        { sender: account, body: plaintext, ts },
      ];
      input = "";
    } catch (err) {
      console.error(err);
      error = "Encryption failed; sending disabled";
      status = "blocked";
    } finally {
      pending = false;
    }
  }

  let pollHandle: number | null = null;

  onMount(() => {
    void joinRoom().then(() => {
      pollHandle = window.setInterval(() => {
        void pollEvents();
      }, 1200);
    });

    return () => {
      if (pollHandle) window.clearInterval(pollHandle);
      pollHandle = null;
    };
  });

  onDestroy(() => {
    if (pollHandle) window.clearInterval(pollHandle);
    pollHandle = null;
  });
</script>

<div class="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
  <div class="flex items-center justify-between text-sm text-white/70">
    <div class="flex items-center gap-2">
      <span
        class="h-2 w-2 rounded-full {status === 'connected'
          ? 'bg-emerald-400 animate-pulse'
          : status === 'blocked'
          ? 'bg-red-400'
          : 'bg-yellow-400'}"
      ></span>
      <span>
        {status === "connected"
          ? "Encrypted channel live (polling relay)"
          : status === "blocked"
          ? "E2EE blocked"
          : status === "joining"
          ? "Joining..."
          : "Disconnected"}
      </span>
    </div>
    <span class="text-white/50 text-xs">You: {shortKey(account)}</span>
  </div>

  <div
    class="min-h-[220px] max-h-[360px] overflow-y-auto rounded-xl border border-white/5 bg-black/30 p-3 space-y-2"
  >
    {#if messages.length === 0}
      <p class="text-xs text-white/50">
        No messages yet. Open another tab, join the same room, and send a message.
      </p>
    {/if}
    {#each messages as msg (msg.ts + msg.sender)}
      <div class="rounded-lg bg-white/5 px-3 py-2">
        <div class="text-xs text-white/60 mb-1">
          {msg.sender === "system" ? "SYSTEM" : shortKey(msg.sender)}
          <span class="text-white/30"> · {new Date(msg.ts).toLocaleTimeString()}</span>
        </div>
        <div class="text-sm text-white/90 break-words">{msg.body}</div>
      </div>
    {/each}
  </div>

  <div class="flex gap-2">
    <input
      class="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
      placeholder="Type encrypted message"
      bind:value={input}
      on:keydown={(e) => e.key === "Enter" && sendMessage()}
      disabled={pending || status !== "connected"}
    />
    <button
      class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
      on:click={sendMessage}
      disabled={pending || status !== "connected"}
    >
      Send
    </button>
  </div>

  {#if error}
    <p class="text-xs text-rose-300">{error}</p>
  {/if}
</div>
