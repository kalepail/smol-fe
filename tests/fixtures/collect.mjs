// Collector fixtures for /mixtapes/[id] (Report 30). Track ids are canonical
// 64-hex SMOL ids so the FE derives real SAC / Comet pool addresses exactly as
// on mainnet; "minted" tracks carry those derived pairs in their D1 fields.
import { createHash } from 'node:crypto';
import { Address, Asset, Networks, StrKey, hash, xdr } from '@stellar/stellar-sdk';

export const FACTORY = 'CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA';
export const KALE_SAC = 'CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV';
export const ISSUER = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';
export const COLLECTOR = StrKey.encodeContract(hash(Buffer.from('smol-e2e-collector')));
export const CREATOR = 'GDXK7EYVBXTITLBW2ZCODJW3B7VTVCNNNWDDEHKJ7Y67TZVW5VKRRMU6';

export function derive(id) {
  const padded = id.padStart(64, '0');
  const sac = new Asset(padded.slice(0, 12), ISSUER).contractId(Networks.PUBLIC);
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(Buffer.from(Networks.PUBLIC)),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: new Address(FACTORY).toScAddress(),
          salt: Buffer.from(padded, 'hex'),
        })
      ),
    })
  );
  return { sac, pool: StrKey.encodeContract(hash(preimage.toXDR())) };
}

const TITLES = [
  'Neon Kale', 'Midnight Soil', 'Leafy Dub', 'Rainy Rows', 'Dirt Disco', 'Sprout Signal',
  'Compost Choir', 'Greenhouse Glow', 'Root Cellar Funk', 'Harvest Moon Loop', 'Seedling Static', 'Dew Point',
];

function trackId(seed) {
  return createHash('sha256').update(`smol-e2e-${seed}`).digest('hex');
}

function makeTrack(seed, title, minted) {
  const id = trackId(seed);
  const pair = derive(id);
  return {
    Id: id,
    Title: title,
    Address: CREATOR,
    Public: 1,
    Song_1: 'first',
    Tags: ['lofi', 'chill'],
    ...(minted ? { Mint_Token: pair.sac, Mint_Amm: pair.pool } : {}),
  };
}

/** 12 songs: 9 minted, 3 not minted. */
export const mixedTracks = TITLES.map((title, i) => makeTrack(`mixed-${i}`, title, i < 9));
/** 8 songs, all minted. */
export const mintedTracks = TITLES.slice(0, 8).map((title, i) => makeTrack(`minted-${i}`, title, true));

export const collectMixtapes = {
  'collect-mixed': {
    Id: 'collect-mixed',
    Title: 'Late Night Kale',
    Desc: 'A late-night set of kale-core, compost dub and greenhouse lofi for slow drives.',
    Address: CREATOR,
    Created_At: '2026-11-20',
    Smols: mixedTracks,
  },
  'collect-minted': {
    Id: 'collect-minted',
    Title: 'Greenhouse Sessions',
    Desc: 'Every song here is minted and ready to collect.',
    Address: CREATOR,
    Created_At: '2026-11-21',
    Smols: mintedTracks,
  },
};

// ---------------------------------------------------------------------------
// Report 34 regressions
// ---------------------------------------------------------------------------

/** Minted on chain, but its pool runs an unaudited executable (#8). */
export const badExecTrack = makeTrack('badexec-0', 'Unaudited Pool', true);
/** Non-hex legacy id whose D1 row carries ANOTHER song's valid pair (#3). */
export const legacyTrack = {
  ...makeTrack('legacy-0', 'Legacy Song', false),
  Id: 'legacy-song',
  Mint_Token: derive(mixedTracks[1].Id).sac,
  Mint_Amm: derive(mixedTracks[1].Id).pool,
};
/** Minted, but no creator Address (#11, Report 30 acceptance 7). */
export const addresslessTrack = { ...makeTrack('noaddr-0', 'No Creator', true), Address: '' };
export const goodTrack = makeTrack('good-0', 'Good Market', true);

collectMixtapes['collect-legacy'] = {
  Id: 'collect-legacy',
  Title: 'Edge Cases',
  Desc: 'Identity and data edge cases.',
  Address: CREATOR,
  Created_At: '2026-11-22',
  Smols: [legacyTrack, badExecTrack, addresslessTrack, goodTrack],
};

/** Song-page fixtures for the canonical trade market (#2). */
export const crosswiredSong = { ...makeTrack('crosswired-0', 'Crosswired Song', false) };
crosswiredSong.Mint_Token = derive(mixedTracks[0].Id).sac; // D1 points at ANOTHER song's market
crosswiredSong.Mint_Amm = derive(mixedTracks[0].Id).pool;
export const unindexedSong = makeTrack('unindexed-0', 'Unindexed Song', false);

function songDetail(track) {
  return {
    d1: { ...track, Song_1: 'first', Instrumental: 0, Created_At: '2026-11-21T16:00:00Z', Requested_Provider: 'aisonggenerator', Actual_Provider: 'aisonggenerator' },
    kv_do: {
      payload: { prompt: 'Collector fixture', instrumental: false, public: true, provider: 'aisonggenerator' },
      description: 'Collector fixture',
      image: true,
      nsfw: { safe: true, categories: [] },
      lyrics: { title: track.Title, style: ['lofi'], lyrics: 'La la' },
      songs: [{ music_id: 'first', status: 4 }],
    },
    liked: false,
  };
}

export const collectSongs = Object.fromEntries(
  [crosswiredSong, unindexedSong, legacyTrack].map((t) => [`/${t.Id}`, songDetail(t)])
);
