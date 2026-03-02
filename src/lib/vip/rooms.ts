export type RoomStatus = "enabled" | "comingSoon";

export type VipRoom = {
  id: string;
  name: string;
  route: string;
  description: string;
  theme: {
    accent: string;
    glow: string;
    bg: string;
  };
  status: RoomStatus;
  qualifier: {
    type: "commons" | "lumenauts" | "aquarius" | "placeholder" | "iceDelegate";
    cutoffTs?: string;
    notes?: string;
  };
  proofFlow: string[];
  e2eePolicy: {
    rotateEveryMessages: number;
    rotateEveryMinutes: number;
    history: number;
  };
  subRooms?: VipRoom[];
};

export const VIP_ROOMS: VipRoom[] = [
  {
    id: "aquarius",
    name: "Aquarius",
    route: "/labs/the-vip/aquarius",
    description:
      "Aqua airdrop verification hub. Snapshot-based eligibility with tiered multipliers.",
    theme: {
      accent: "#9c6bff",
      glow: "rgba(156,107,255,0.35)",
      bg: "linear-gradient(135deg, #0c071a, #120e2b)",
    },
    status: "comingSoon",
    qualifier: {
      type: "aquarius",
      notes: "DEX trade before 2021-01-01 UTC; bonus tiers TBD.",
    },
    proofFlow: [
      "Connect Stellar wallet",
      "Sign snapshot challenge",
      "Run Aquarius trade verifier (coming soon)",
    ],
    e2eePolicy: {
      rotateEveryMessages: 25,
      rotateEveryMinutes: 10,
      history: 0,
    },
    subRooms: [
      {
        id: "aquarius-lounge",
        name: "Aquarius Lounge (Eligible Wallets)",
        route: "/labs/the-vip/aquarius#lounge",
        description: "Base eligibility holders. Snapshot-gated.",
        theme: { accent: "#a78bfa", glow: "rgba(167,139,250,0.35)", bg: "" },
        status: "comingSoon",
        qualifier: { type: "aquarius", notes: "Level 1+" },
        proofFlow: [],
        e2eePolicy: { rotateEveryMessages: 25, rotateEveryMinutes: 10, history: 0 },
      },
      {
        id: "ice-delegates",
        name: "ICE Delegates",
        route: "/labs/the-vip/aquarius#ice",
        description: "Delegates track. Slot wired; verifier arriving soon.",
        theme: { accent: "#7dd3fc", glow: "rgba(125,211,252,0.35)", bg: "" },
        status: "comingSoon",
        qualifier: { type: "iceDelegate", notes: "Token/contract verifier TBD" },
        proofFlow: [],
        e2eePolicy: { rotateEveryMessages: 25, rotateEveryMinutes: 10, history: 0 },
      },
      {
        id: "airdrop-tier-2",
        name: "Airdrop Tier 2",
        route: "/labs/the-vip/aquarius#t2",
        description: "Eligible + 1 bonus criterion (x2).",
        theme: { accent: "#c084fc", glow: "rgba(192,132,252,0.3)", bg: "" },
        status: "comingSoon",
        qualifier: { type: "aquarius", notes: "Level 2" },
        proofFlow: [],
        e2eePolicy: { rotateEveryMessages: 25, rotateEveryMinutes: 10, history: 0 },
      },
      {
        id: "airdrop-tier-3",
        name: "Airdrop Tier 3",
        route: "/labs/the-vip/aquarius#t3",
        description: "Eligible + 2 bonus criteria (x4).",
        theme: { accent: "#a855f7", glow: "rgba(168,85,247,0.3)", bg: "" },
        status: "comingSoon",
        qualifier: { type: "aquarius", notes: "Level 3" },
        proofFlow: [],
        e2eePolicy: { rotateEveryMessages: 25, rotateEveryMinutes: 10, history: 0 },
      },
      {
        id: "airdrop-tier-4",
        name: "Airdrop Tier 4",
        route: "/labs/the-vip/aquarius#t4",
        description: "Eligible + 3 bonus criteria (x8).",
        theme: { accent: "#9333ea", glow: "rgba(147,51,234,0.3)", bg: "" },
        status: "comingSoon",
        qualifier: { type: "aquarius", notes: "Level 4" },
        proofFlow: [],
        e2eePolicy: { rotateEveryMessages: 25, rotateEveryMinutes: 10, history: 0 },
      },
    ],
  },
  {
    id: "lumenauts",
    name: "Lumenauts",
    route: "/labs/the-vip/lumenauts",
    description: "For early Stellar accounts created before 2019-10-28 16:00 UTC.",
    theme: {
      accent: "#0ea5e9",
      glow: "rgba(14,165,233,0.25)",
      bg: "linear-gradient(135deg, #03111c, #041c2d)",
    },
    status: "enabled",
    qualifier: {
      type: "lumenauts",
      cutoffTs: "2019-10-28T16:00:00Z",
      notes: "Earliest effect timestamp must predate cutoff.",
    },
    proofFlow: [
      "Connect Stellar wallet",
      "Sign SEP-10 challenge tx",
      "Server checks earliest ledger close time",
    ],
    e2eePolicy: {
      rotateEveryMessages: 20,
      rotateEveryMinutes: 10,
      history: 0,
    },
  },
  {
    id: "commons",
    name: "Commons",
    route: "/labs/the-vip/commons",
    description: "General VIP commons. Must prove account exists on-ledger.",
    theme: {
      accent: "#10b981",
      glow: "rgba(16,185,129,0.25)",
      bg: "linear-gradient(135deg, #04130c, #052317)",
    },
    status: "enabled",
    qualifier: {
      type: "commons",
      notes: "Horizon account lookup must succeed.",
    },
    proofFlow: [
      "Connect Stellar wallet",
      "Sign SEP-10 challenge tx",
      "Server checks account existence",
    ],
    e2eePolicy: {
      rotateEveryMessages: 20,
      rotateEveryMinutes: 10,
      history: 0,
    },
  },
  {
    id: "placeholder",
    name: "Your Chat Here — Contact Admin",
    route: "#",
    description: "Reserved slot for the next VIP cohort.",
    theme: {
      accent: "#cbd5e1",
      glow: "rgba(203,213,225,0.15)",
      bg: "linear-gradient(135deg, #0b0c0f, #111218)",
    },
    status: "comingSoon",
    qualifier: { type: "placeholder" },
    proofFlow: [],
    e2eePolicy: {
      rotateEveryMessages: 0,
      rotateEveryMinutes: 0,
      history: 0,
    },
  },
];

export function findRoom(id: string): VipRoom | undefined {
  return VIP_ROOMS.find((room) => room.id === id);
}
