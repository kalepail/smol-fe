
/**
 * Shared Schema Definitions for AEO/GEO Visibility
 */

export const SITE_URL = "https://noot.smol.xyz";
export const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

export const SMOL_IDENTITY = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    "name": "Smol",
    "alternateName": ["Smol AI", "Smol XYZ"],
    "url": SITE_URL,
    "logo": {
        "@type": "ImageObject",
        "url": `${SITE_URL}/favicon.png`,
        "width": 512,
        "height": 512
    },
    "description": "Decentralized AI music generation platform on Stellar blockchain.",
    "sameAs": [
        "https://twitter.com/smolxyz",
        "https://github.com/Kalepail",
        "https://discord.com/invite/stellar-global-761985725453303838"
    ],
    "foundingDate": "2024-01-01",
    "founder": {
        "@type": "Person",
        "name": "Noot",
        "url": "https://x.com/tactical_noot",
        "alternateName": "noot.xlm"
    }
};

export const SMOL_WEBSITE = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    "url": SITE_URL,
    "name": "Smol AI Music Generator",
    "description": "Create full songs from text prompts, mint NFTs, and collect music onchain.",
    "publisher": {
        "@id": `${SITE_URL}/#organization`
    },
    "potentialAction": {
        "@type": "SearchAction",
        "target": {
            "@type": "EntryPoint",
            "urlTemplate": `${SITE_URL}/tags?q={search_term_string}`
        },
        "query-input": "required name=search_term_string"
    }
};
