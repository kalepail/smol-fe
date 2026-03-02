import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Asset generation note:
// The reviewer-facing prompt for ZK Dungeon references OpenAI's ImageGen skill guide
// (https://github.com/openai/skills/blob/main/skills/.curated/imagegen/SKILL.md).
// This repo pass generates cohesive placeholder art locally (SVG -> WEBP via sharp) so
// the UI ships with themed assets without requiring external tooling.
//
// If you *do* have an imagegen-capable API key, you can generate richer art:
//   OPENAI_API_KEY=... node scripts/generate_zkdungeon_art.mjs --provider=openai
// This keeps the repo buildable without paid services, while still allowing high-quality assets.

const OUT_DIR = path.join(process.cwd(), "public", "labs", "zkdungeon", "art");

const PALETTE = {
  bg0: "#03060b",
  bg1: "#071019",
  ink: "#cfe7ff",
  inkDim: "rgba(207,231,255,0.65)",
  kale: "#9ae600",
  cyan: "#4ad0ff",
  violet: "#9b7bff",
  amber: "#ffc47a",
  mint: "#7bffb0",
};

function parseArgs(argv) {
  const out = { provider: "svg" };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--provider=")) out.provider = arg.split("=", 2)[1] || "svg";
  }
  return out;
}

async function writeWebpFromPngBuffer(pngBuf, outPath, { w, h, q = 82 } = {}) {
  await sharp(pngBuf)
    .resize(w, h, { fit: "cover" })
    .webp({ quality: q })
    .toFile(outPath);
}

async function openaiImage(prompt, { size = "1024x1024" } = {}) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY (required for --provider=openai)");
  }

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      response_format: "b64_json",
      n: 1,
    }),
  });

  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = json?.error?.message || JSON.stringify(json) || `HTTP ${resp.status}`;
    throw new Error(`OpenAI image generation failed: ${msg}`);
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image generation returned no image data");
  return Buffer.from(b64, "base64");
}

function svgHeader(w, h) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PALETTE.bg0}"/>
      <stop offset="1" stop-color="${PALETTE.bg1}"/>
    </linearGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <path d="M 24 0 L 24 48 M 0 24 L 48 24" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
    </pattern>
    <filter id="noise" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix type="matrix" values="
        1 0 0 0 0
        0 1 0 0 0
        0 0 1 0 0
        0 0 0 0.06 0"/>
    </filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feColorMatrix type="matrix" values="
        1 0 0 0 0
        0 1 0 0 0
        0 0 1 0 0
        0 0 0 0.25 0" in="b" result="g"/>
      <feMerge>
        <feMergeNode in="g"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <g id="kaleLeaf" opacity="0.75">
      <path d="M16 2 C10 6 8 12 10 18 C12 24 18 28 24 30 C30 28 36 24 38 18 C40 12 38 6 32 2 C28 6 26 10 24 14 C22 10 20 6 16 2 Z"
        fill="none" stroke="rgba(154,230,0,0.35)" stroke-width="1.5"/>
      <path d="M24 12 L24 28" stroke="rgba(154,230,0,0.28)" stroke-width="1"/>
    </g>
  </defs>
`;
}

function svgFooter() {
  return `</svg>`;
}

function esc(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

function mkBadgeSvg({ w, h, label, accent }) {
  const t = esc(label);
  return (
    svgHeader(w, h) +
    `
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#grid)" opacity="0.9"/>
  <rect width="${w}" height="${h}" filter="url(#noise)"/>

  <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.33}" fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
  <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.33}" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="3" filter="url(#glow)"/>
  <g transform="translate(${w / 2 - 24}, ${h / 2 - 22}) scale(1.6)">
    <use href="#kaleLeaf"/>
  </g>

  <text x="${w / 2}" y="${h - 42}" fill="${PALETTE.ink}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
        font-size="22" text-anchor="middle" letter-spacing="2">${t}</text>
` +
    svgFooter()
  );
}

function mkRoomHeaderSvg({ w, h, title, subtitle, accent }) {
  return (
    svgHeader(w, h) +
    `
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#grid)" opacity="0.95"/>
  <rect width="${w}" height="${h}" filter="url(#noise)"/>

  <g opacity="0.9" filter="url(#glow)">
    <path d="M80 ${h - 110} C 260 ${h - 220}, 520 ${h - 40}, 760 ${h - 170} S 1180 ${h - 220}, ${w - 80} ${h - 150}"
      fill="none" stroke="${accent}" stroke-opacity="0.45" stroke-width="6"/>
    <path d="M80 ${h - 70} C 280 ${h - 160}, 520 ${h - 30}, 780 ${h - 120} S 1200 ${h - 170}, ${w - 80} ${h - 90}"
      fill="none" stroke="${PALETTE.kale}" stroke-opacity="0.28" stroke-width="3"/>
  </g>

  <g transform="translate(${w - 170}, 70)">
    <circle cx="0" cy="0" r="58" fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
    <circle cx="0" cy="0" r="58" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="3"/>
    <g transform="translate(-24,-26) scale(1.3)">
      <use href="#kaleLeaf"/>
    </g>
  </g>

  <text x="80" y="120" fill="${PALETTE.ink}" font-family="Georgia, 'Times New Roman', Times, serif" font-size="44" letter-spacing="1">${esc(
    title,
  )}</text>
  <text x="82" y="160" fill="${PALETTE.inkDim}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'"
        font-size="18">${esc(subtitle)}</text>

  <text x="80" y="${h - 40}" fill="rgba(207,231,255,0.35)"
        font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
        font-size="14" letter-spacing="2">MIDNIGHT KALE SECURITY MANUAL • VAULT WING</text>
` +
    svgFooter()
  );
}

function mkBlueprintSvg({ w, h }) {
  const rooms = [
    { name: "AIRLOCK", x: 140, y: 210, w: 260, h: 160, accent: PALETTE.cyan },
    { name: "INTAKE", x: 470, y: 160, w: 300, h: 200, accent: PALETTE.kale },
    { name: "CATALOG", x: 820, y: 170, w: 320, h: 190, accent: PALETTE.violet },
    { name: "COLD", x: 1180, y: 140, w: 300, h: 230, accent: PALETTE.mint },
    { name: "LEDGER", x: 980, y: 440, w: 360, h: 190, accent: PALETTE.amber },
  ];

  const roomRects = rooms
    .map(
      (r) => `
    <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="18" fill="rgba(0,0,0,0.22)"
          stroke="rgba(255,255,255,0.10)" stroke-width="2"/>
    <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="18" fill="none"
          stroke="${r.accent}" stroke-opacity="0.40" stroke-width="3" filter="url(#glow)"/>
    <text x="${r.x + 22}" y="${r.y + 44}" fill="${PALETTE.ink}" opacity="0.9"
          font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
          font-size="18" letter-spacing="2">${esc(r.name)}</text>
    `,
    )
    .join("\n");

  return (
    svgHeader(w, h) +
    `
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#grid)" opacity="0.95"/>
  <rect width="${w}" height="${h}" filter="url(#noise)"/>

  <g opacity="0.9">
    <text x="80" y="90" fill="${PALETTE.ink}" font-family="Georgia, 'Times New Roman', Times, serif" font-size="48">Kale-Seed Vault Blueprint</text>
    <text x="84" y="125" fill="${PALETTE.inkDim}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" font-size="16" letter-spacing="1">
      AIRLOCK → INTAKE → CATALOG → COLD → LEDGER
    </text>
  </g>

  <g opacity="0.8">
    <path d="M400 290 L470 260" stroke="rgba(255,255,255,0.14)" stroke-width="3" />
    <path d="M770 260 L820 265" stroke="rgba(255,255,255,0.14)" stroke-width="3" />
    <path d="M1140 265 L1180 270" stroke="rgba(255,255,255,0.14)" stroke-width="3" />
    <path d="M1320 370 L1220 440" stroke="rgba(255,255,255,0.14)" stroke-width="3" />
  </g>

  <g>
    ${roomRects}
  </g>

  <g transform="translate(90, ${h - 200})" opacity="0.9">
    <text x="0" y="0" fill="${PALETTE.ink}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" font-size="14" letter-spacing="2">LEGEND</text>
    <text x="0" y="28" fill="rgba(207,231,255,0.60)" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" font-size="12">
      Room verifiers: Groth16 / UltraHonk / RISC0 • Audit stamps: digest-only on-chain records
    </text>
  </g>
` +
    svgFooter()
  );
}

function mkSeamlessTextureSvg({ w, h, kind }) {
  const accent = kind === "kale" ? PALETTE.kale : "rgba(255,255,255,0.10)";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="tbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#02050a"/>
      <stop offset="1" stop-color="#07121c"/>
    </linearGradient>
    <pattern id="leafpat" width="160" height="160" patternUnits="userSpaceOnUse">
      <g transform="translate(32,22)" opacity="0.7">
        <path d="M16 2 C10 6 8 12 10 18 C12 24 18 28 24 30 C30 28 36 24 38 18 C40 12 38 6 32 2 C28 6 26 10 24 14 C22 10 20 6 16 2 Z"
          fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="1.4"/>
      </g>
      <g transform="translate(104,92) rotate(18)" opacity="0.6">
        <path d="M16 2 C10 6 8 12 10 18 C12 24 18 28 24 30 C30 28 36 24 38 18 C40 12 38 6 32 2 C28 6 26 10 24 14 C22 10 20 6 16 2 Z"
          fill="none" stroke="${accent}" stroke-opacity="0.20" stroke-width="1.2"/>
      </g>
    </pattern>
    <filter id="n" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="
        1 0 0 0 0
        0 1 0 0 0
        0 0 1 0 0
        0 0 0 0.05 0"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#tbg)"/>
  <rect width="${w}" height="${h}" fill="url(#leafpat)" />
  <rect width="${w}" height="${h}" filter="url(#n)" />
</svg>`
  );
}

async function writeWebpFromSvg(svg, outPath, { w, h, q = 82 } = {}) {
  const buf = Buffer.from(svg);
  await sharp(buf, { density: 144 })
    .resize(w, h, { fit: "cover" })
    .webp({ quality: q })
    .toFile(outPath);
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(OUT_DIR, { recursive: true });

  const assets = [
    {
      name: "vault-blueprint-map.webp",
      w: 1600,
      h: 900,
      svg: mkBlueprintSvg({ w: 1600, h: 900 }),
    },

    {
      name: "room-airlock.webp",
      w: 1600,
      h: 520,
      svg: mkRoomHeaderSvg({
        w: 1600,
        h: 520,
        title: "Airlock",
        subtitle: "Entry protocol • Mainnet audit stamp (passkey)",
        accent: PALETTE.cyan,
      }),
    },
    {
      name: "room-intake.webp",
      w: 1600,
      h: 520,
      svg: mkRoomHeaderSvg({
        w: 1600,
        h: 520,
        title: "Intake Wing",
        subtitle: "Minimum clearance • Groth16 (BN254) gate",
        accent: PALETTE.kale,
      }),
    },
    {
      name: "room-catalog.webp",
      w: 1600,
      h: 520,
      svg: mkRoomHeaderSvg({
        w: 1600,
        h: 520,
        title: "Catalog Hall",
        subtitle: "Role-based access • Noir UltraHonk verifier",
        accent: PALETTE.violet,
      }),
    },
    {
      name: "room-cold.webp",
      w: 1600,
      h: 520,
      svg: mkRoomHeaderSvg({
        w: 1600,
        h: 520,
        title: "Cold Storage",
        subtitle: "Two-factor policy • RISC0 receipt sentinel",
        accent: PALETTE.mint,
      }),
    },
    {
      name: "room-ledger.webp",
      w: 1600,
      h: 520,
      svg: mkRoomHeaderSvg({
        w: 1600,
        h: 520,
        title: "Ledger Chamber",
        subtitle: "Withdrawal record • Mainnet digest stamp (passkey)",
        accent: PALETTE.amber,
      }),
    },

    {
      name: "guardian-groth16.webp",
      w: 900,
      h: 900,
      svg: mkBadgeSvg({ w: 900, h: 900, label: "GROTH16", accent: PALETTE.kale }),
    },
    {
      name: "guardian-noir.webp",
      w: 900,
      h: 900,
      svg: mkBadgeSvg({ w: 900, h: 900, label: "NOIR", accent: PALETTE.violet }),
    },
    {
      name: "guardian-risc0.webp",
      w: 900,
      h: 900,
      svg: mkBadgeSvg({ w: 900, h: 900, label: "RISC0", accent: PALETTE.mint }),
    },

    {
      name: "badge-groth16.webp",
      w: 256,
      h: 256,
      svg: mkBadgeSvg({ w: 256, h: 256, label: "G16", accent: PALETTE.kale }),
    },
    {
      name: "badge-noir.webp",
      w: 256,
      h: 256,
      svg: mkBadgeSvg({ w: 256, h: 256, label: "HK", accent: PALETTE.violet }),
    },
    {
      name: "badge-risc0.webp",
      w: 256,
      h: 256,
      svg: mkBadgeSvg({ w: 256, h: 256, label: "RX", accent: PALETTE.mint }),
    },

    {
      name: "texture-midnight-kale.webp",
      w: 1024,
      h: 1024,
      svg: mkSeamlessTextureSvg({ w: 1024, h: 1024, kind: "kale" }),
    },
    {
      name: "texture-placard.webp",
      w: 1024,
      h: 1024,
      svg: mkSeamlessTextureSvg({ w: 1024, h: 1024, kind: "placard" }),
    },
  ];

  for (const a of assets) {
    const outPath = path.join(OUT_DIR, a.name);
    // eslint-disable-next-line no-console
    console.log("render", a.name, `(provider=${args.provider})`);

    if (args.provider === "openai") {
      // Cozy "midnight kale" pixel-farm vibes (Stardew/Harvest Moon energy).
      // We still resize to the exact output dimensions expected by the UI.
      const prompt =
        a.name === "vault-blueprint-map.webp"
          ? "Top-down map of a highly protected kale-seed vault, cozy pixel art (16-bit), midnight palette, labeled rooms: Airlock, Intake Wing, Catalog Hall, Cold Storage, Ledger Chamber. Subtle stars, neat readable layout, not scary."
          : a.name.startsWith("room-")
            ? `Cozy pixel art scene header for "${a.name.replace("room-", "").replace(".webp", "")}" inside a kale-seed vault at night, gentle glow, farming vibe, stardew valley / harvest moon mood, subtle blueprint overlay, no text.`
            : a.name.startsWith("guardian-")
              ? `Cozy pixel art portrait of a guardian for "${a.name.replace("guardian-", "").replace(".webp", "")}" verifier, midnight kale theme, friendly but serious, clean silhouette, no text.`
              : a.name.startsWith("badge-")
                ? "Small high-contrast pixel icon badge: kale leaf + cryptography glyph, midnight palette, readable at small sizes, no text."
                : a.name.includes("texture-midnight-kale")
                  ? "Seamless texture, midnight kale leaf pattern, subtle stars and grid, cozy pixel style."
                  : "Seamless subtle laminated placard texture, midnight palette, cozy pixel style, faint scuffs.";

      const png = await openaiImage(prompt, { size: "1024x1024" });
      await writeWebpFromPngBuffer(png, outPath, { w: a.w, h: a.h, q: 84 });
    } else {
      await writeWebpFromSvg(a.svg, outPath, { w: a.w, h: a.h, q: 82 });
    }
  }

  // eslint-disable-next-line no-console
  console.log("done:", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
