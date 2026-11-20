import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// E21 readability guardrail: the WCAG 2.2 ratios of the palette in globals.css, read from the file itself so a
// token change that breaks separation or text contrast fails here before it reaches a screen.

const CSS = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = CSS.slice(start, CSS.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)) {
    if (m[1] && m[2]) out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const THEMES = { light: block(':root'), dark: block('.dark') };

function token(theme: Record<string, string>, name: string): string {
  const v = theme[name];
  if (!v) throw new Error(`missing --${name}`);
  return v;
}

const TEXT = [
  'text',
  'text-muted',
  'text-subtle',
  'accent-c',
  'found-ink',
  'success',
  'warning',
  'risk',
  'conf-confirmed',
  'conf-estimated',
  'conf-norm',
];

describe.each(Object.entries(THEMES))('palette %s', (_, t) => {
  it('the WCAG formula matches the known reference (black on white = 21:1)', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('cards separate from the page (surface vs bg ≥ 1.15:1)', () => {
    expect(contrast(token(t, 'surface'), token(t, 'bg'))).toBeGreaterThanOrEqual(1.15);
  });

  it('card outlines are visible (border vs surface ≥ 1.6:1)', () => {
    expect(contrast(token(t, 'border'), token(t, 'surface'))).toBeGreaterThanOrEqual(1.6);
  });

  it('interactive edges stay ≥ 3:1 (border-strong on bg and surface)', () => {
    for (const bg of ['bg', 'surface'])
      expect(contrast(token(t, 'border-strong'), token(t, bg))).toBeGreaterThanOrEqual(3);
  });

  it.each(TEXT)('--%s reads at ≥ 4.5:1 on bg and surface', (name) => {
    for (const bg of ['bg', 'surface'])
      expect(contrast(token(t, name), token(t, bg)), `${name} on ${bg}`).toBeGreaterThanOrEqual(
        4.5,
      );
  });

  it('body text pairs read at ≥ 4.5:1 on the recessed surface', () => {
    for (const name of ['text', 'text-muted', 'text-subtle', 'accent-c'])
      expect(contrast(token(t, name), token(t, 'surface-2')), name).toBeGreaterThanOrEqual(4.5);
  });

  it('"Não faça" keeps a visible tinted fill (risk-fill vs bg ≥ 1.1:1) that ink and the icon read on', () => {
    expect(contrast(token(t, 'risk-fill'), token(t, 'bg'))).toBeGreaterThanOrEqual(1.1);
    expect(contrast(token(t, 'text'), token(t, 'risk-fill'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(t, 'text-muted'), token(t, 'risk-fill'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(t, 'risk'), token(t, 'risk-fill'))).toBeGreaterThanOrEqual(3);
  });
});
