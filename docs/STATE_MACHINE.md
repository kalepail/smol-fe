# Smol FE State Machine

## Core Flows

```mermaid
stateDiagram-v2
    direction LR

    %% Audio Subsystem
    state "Audio Playback" as Audio {
        [*] --> Idle
        Idle --> Loading: selectSong(smol)
        Loading --> Playing: onCanPlay
        Playing --> Paused: togglePlayPause()
        Paused --> Playing: togglePlayPause()
        Playing --> [*]: Song End
    }

    %% Auth & Tipping Subsystem
    state "Auth & Tipping" as Auth {
        [*] --> Disconnected
        Disconnected --> Connected: Connect Wallet (Albedo/Passkey)
        
        state "Connected" as Conn {
            [*] --> Ready
            Ready --> Building: User Clicks "Send"
            Building --> Signing: kale.transfer()
            Signing --> Submitting: account.sign() (Passkey Prompt)
            Submitting --> Relaying: server.send() (OZ Channels)
            Relaying --> Success: 200 OK
            Relaying --> Failed: 4xx/5xx Error
        }
    }

    %% Page Navigation (Consistency Risk)
    state "Navigation" as Nav {
        [*] --> Listing: /
        Listing --> Detail: Click Card
        Detail --> Fetching: /[id]
        Fetching --> Rendered: Data Loaded
        
        note right of Fetching
            Risk: API Eventual Consistency
            Snapshot vs Live Data mismatch
        end note
    }
```

## Critical State Hotspots
1.  **Audio Sync**: `src/stores/audio.svelte.ts` uses `BroadcastChannel` to pause other tabs.
2.  **Passkey Signing**: `src/utils/passkey-kit` relies on `navigator.credentials.get`.
3.  **Relayer**: `src/utils/relayer-adapter.ts` holds the API key and handles nonces.
