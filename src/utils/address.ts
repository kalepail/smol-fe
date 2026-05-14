export function shortenAddress(address?: string | null, head = 6, tail = 4): string {
  if (!address) return '';
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
}
