/**
 * @param {import("../types/domain").Smol[]} snapshot
 * @param {string} address
 */
export function getCollectedSmols(snapshot, address) {
  const collectedCandidates = snapshot.filter((smol) => smol.Minted_By === address);
  const collectedSmols = collectedCandidates.filter(
    (smol) => smol.Address !== address && smol.Creator !== address,
  );

  return { collectedSmols, collectedCandidates };
}
