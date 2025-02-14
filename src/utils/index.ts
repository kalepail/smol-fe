export const WHITE = 256 ** 3 - 1;

export function pixelToHex(pixel: number) {
    return `${intToHex((pixel >> 16) & 255)}${intToHex(
        (pixel >> 8) & 255,
    )}${intToHex(pixel & 255)}`;
}
export function intToHex(int: number | string) {
    if (typeof int === "string") int = int.replace(/\D/g, "");

    if (!int) int = 0;

    return int.toString(16).padStart(2, "0");
}