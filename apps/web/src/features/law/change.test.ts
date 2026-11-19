// "Law changed" mapping (ARCHITECTURE §2.6): page → regulation, diff → corpus provisions → rules.
import type { EngineResult, Finding } from '@refund/engine';
import { article } from '@refund/law';
import { lawChangeFixture } from '@refund/sources';
import { describe, expect, it } from 'vitest';
import {
  affectedArticles,
  affectedRules,
  diffLines,
  regulationOfUrl,
  simulationDelta,
} from './change.ts';

const fixture = (() => {
  const r = lawChangeFixture('lc123-2006-2026-10-21');
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
})();

describe('regulationOfUrl', () => {
  it('matches the catalog URL ignoring scheme, www, query and trailing slash', () => {
    expect(regulationOfUrl('https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm')?.id).toBe(
      'lc123-2006',
    );
    expect(regulationOfUrl('http://planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm/?x=1')?.id).toBe(
      'lc123-2006',
    );
    expect(regulationOfUrl('https://example.com/lcp123.htm')).toBeUndefined();
    expect(regulationOfUrl('not a url')).toBeUndefined();
  });
});

describe('diffLines', () => {
  it('splits removed and added lines, skipping headers', () => {
    expect(diffLines('--- a\n+++ b\n@@ -1 +1 @@\n same\n-old line\n+new line')).toEqual({
      removed: ['old line'],
      added: ['new line'],
    });
  });
});

describe('affectedArticles and affectedRules', () => {
  it('the fixture touches LC 123, art. 18-A, §§ 1º and 2º, read by R03 only', () => {
    const ids = affectedArticles('lc123-2006', fixture.page.diffText ?? '');
    expect(ids).toEqual(['lc123-2006/art18-a/p1', 'lc123-2006/art18-a/p2']);
    expect(affectedRules(ids)).toEqual(['R03']);
  });

  it('a line of a provision touches it; a change outside the corpus touches nothing', () => {
    const p = article('lc123-2006/art18/p5-j');
    if (!p) throw new Error('corpus');
    const line = p.text.split('\n')[0] ?? '';
    expect(affectedArticles('lc123-2006', `-${line}\n+${line} (alterado)`)).toEqual([
      'lc123-2006/art18/p5-j',
    ]);
    expect(affectedRules(['lc123-2006/art18/p5-j'])).toEqual(['R01']);
    expect(
      affectedArticles('lc123-2006', '-Texto que não está no corpus do Refund.\n+Outro.'),
    ).toEqual([]);
    expect(affectedArticles('lc123-2006', '-de\n+a')).toEqual([]);
    expect(affectedArticles('nope', `-${line}`)).toEqual([]);
  });

  it('rules come in the engine display order, without repeats', () => {
    expect(affectedRules(['lc123-2006/art18/p1-a', 'lc123-2006/art18/p5-j', 'x'])).toEqual([
      'R01',
      'R05',
      'R06',
      'R05-REC',
      'R03',
    ]);
  });
});

describe('simulationDelta', () => {
  const finding = (ruleId: string, cents: number) =>
    ({ ruleId, title: `t-${ruleId}`, marginalValue12m: cents }) as Finding;
  const result = (findings: Finding[], total: number) =>
    ({ findings, total: { savings12m: total } }) as EngineResult;

  it('compares only the affected rules, including one that appears or disappears', () => {
    const before = result([finding('R01', 1000), finding('R05', 500)], 1500);
    const after = result([finding('R01', 800), finding('R03', 0)], 800);
    expect(simulationDelta(before, after, ['R01', 'R03'])).toEqual({
      findings: [
        { ruleId: 'R01', title: 't-R01', beforeCents: 1000, afterCents: 800 },
        { ruleId: 'R03', title: 't-R03', beforeCents: 0, afterCents: 0 },
      ],
      totalBeforeCents: 1500,
      totalAfterCents: 800,
    });
  });
});
