export type LyricBlock =
  | { kind: 'section'; text: string; key: number }
  | { kind: 'line'; text: string; key: number }
  | { kind: 'break'; key: number };

const SECTION_TAG_RE = /^\[[^\]]+\]$/;

export function isLyricSectionTag(line: string): boolean {
  return SECTION_TAG_RE.test(line.trim());
}

export function parseLyricBlocks(rawLyrics: string): LyricBlock[] {
  const lines = rawLyrics.replace(/\r\n?/g, '\n').split('\n');
  const out: LyricBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1].kind !== 'break') {
        out.push({ kind: 'break', key: i });
      }
    } else if (SECTION_TAG_RE.test(trimmed)) {
      out.push({ kind: 'section', text: trimmed.slice(1, -1), key: i });
    } else {
      out.push({ kind: 'line', text: lines[i], key: i });
    }
  }
  return out;
}
