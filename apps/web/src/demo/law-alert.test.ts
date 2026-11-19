// /demo "simular publicação" model (E16 task 3): the fixture through the webhook's own mapping, labelled simulation.
import { PARAMETER_SCENARIOS } from '@refund/engine';
import { regulations } from '@refund/law';
import { describe, expect, it } from 'vitest';
import { DEMO_LAW_CHANGE, demoLawAlert } from './law-alert.ts';

describe('demoLawAlert (hero)', () => {
  it('shows the synthetic diff, the provisions it touches and the rule that reads them', async () => {
    const m = await demoLawAlert('dev-exportador');
    if (!m) throw new Error('model');
    expect(m.simulation).toBe(true);
    expect(m.fixtureOrigin).toBe('synthetic');
    expect(m.fixtureNote).toContain('não é uma captura real');
    expect(m.regulationLabel).toBe('LC 123/2006');
    expect(m.articles.map((a) => a.label)).toEqual([
      'LC 123/2006, art. 18-A, § 1º',
      'LC 123/2006, art. 18-A, § 2º',
    ]);
    expect(m.rules).toEqual([{ ruleId: 'R03', name: 'Limite do Simples e do MEI', yours: false }]);
    expect(m.lines.map((l) => l.kind)).toEqual(['removed', 'added', 'removed', 'added']);
    expect(m.lines[0]?.text).toContain('R$ 81.000,00');
    expect(m.lines[1]?.text).toContain('R$ 140.000,00');
    expect(m.summary).toContain('marcados para revisão');
    expect(m.monitoredCount).toBe(new Set(regulations.map((r) => r.url)).size);
    expect(m.since).toBe('2026-11-12');
  });

  it('recalculates nothing while no scenario is defined (EXECUTION §9, E16)', async () => {
    expect(DEMO_LAW_CHANGE.scenarioId).toBeNull();
    expect(PARAMETER_SCENARIOS).toEqual([]);
    expect((await demoLawAlert('dev-exportador'))?.delta).toBeNull();
  });

  it('an unknown persona has no model', async () => {
    expect(await demoLawAlert('nope')).toBeNull();
  });
});
