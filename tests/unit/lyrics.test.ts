import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLyricSectionTag, parseLyricBlocks } from '../../src/utils/lyrics.ts';

describe('lyrics parser', () => {
  it('parses [Section] markers, lines, and collapses multiple blank lines', () => {
    const raw = `[Intro]\n(Yeah)\n\n\n[Verse 1]\nNeon glow\nMidnight flow\n`;
    const blocks = parseLyricBlocks(raw);
    assert.deepEqual(
      blocks.map(({ kind, ...rest }) => ({ kind, ...('text' in rest ? { text: rest.text } : {}) })),
      [
        { kind: 'section', text: 'Intro' },
        { kind: 'line', text: '(Yeah)' },
        { kind: 'break' },
        { kind: 'section', text: 'Verse 1' },
        { kind: 'line', text: 'Neon glow' },
        { kind: 'line', text: 'Midnight flow' },
        { kind: 'break' },
      ]
    );
    assert.equal(isLyricSectionTag('[Chorus]'), true);
    assert.equal(isLyricSectionTag('Regular line'), false);
  });

  it('handles CRLF line endings, leading blank lines, and inline annotations like [Chorus] x2', () => {
    const raw = `\r\n\r\n[Verse 1]\r\nFirst line\r\n[Chorus] x2\r\nSecond line\r\n`;
    const blocks = parseLyricBlocks(raw);
    assert.deepEqual(
      blocks.map(({ kind, ...rest }) => ({ kind, ...('text' in rest ? { text: rest.text } : {}) })),
      [
        { kind: 'section', text: 'Verse 1' },
        { kind: 'line', text: 'First line' },
        { kind: 'line', text: '[Chorus] x2' },
        { kind: 'line', text: 'Second line' },
        { kind: 'break' },
      ]
    );
    assert.equal(isLyricSectionTag('[Chorus] x2'), false);
  });
});
