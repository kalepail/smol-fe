import type { sac } from './passkey-kit';

export function abbreviateNumber(value: bigint): string {
    const num = Number(value) / 10000000; // Convert from stroops to tokens
    if (num < 1000) return num.toString();

    const suffixes = ['', 'K', 'M', 'B', 'T'];
    let suffixIndex = 0;
    let divisor = 1;

    while (num >= divisor * 1000 && suffixIndex < suffixes.length - 1) {
        divisor *= 1000;
        suffixIndex++;
    }

    const result = num / divisor;
    if (result % 1 === 0) {
        return result.toString() + suffixes[suffixIndex];
    } else {
        return result.toFixed(result < 10 ? 2 : 1) + suffixes[suffixIndex];
    }
}

export async function getTokenBalance(
    mintTokenClient: ReturnType<typeof sac.getSACClient>,
    contractId: string
): Promise<bigint> {
    try {
        const { result } = await mintTokenClient.balance({ id: contractId });
        return result;
    } catch {
        return 0n;
    }
}
