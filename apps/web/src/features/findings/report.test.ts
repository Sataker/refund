import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEMO_LABEL, LIVE_LABEL } from '@/components/brand/sandbox-seal';
import { demoSnapshot } from '@/demo/snapshot.ts';
import { Report } from './report.tsx';

// Compliance review G2 M1: the report is shared by /demo, /app and /r/[token]. Only /demo may say "dados sintéticos";
// /app and /r show a real company's public data (the SandboxSeal rule, compliance review E11 C8).

async function render(live: boolean | undefined): Promise<string> {
  const s = await demoSnapshot('dev-exportador');
  if (!s.ok) throw new Error(s.reason);
  return renderToStaticMarkup(
    createElement(Report, {
      company: s.value.view.companyName,
      analysisDate: s.value.facts.analysisDate,
      result: s.value.result,
      model: s.value.dashboard,
      labelOf: () => undefined,
      ...(live === undefined ? {} : { live }),
    }),
  );
}

describe('Report footer seal', () => {
  it('/demo (default): synthetic data', async () => {
    const html = await render(undefined);
    expect(html).toContain(DEMO_LABEL);
    expect(html).not.toContain(LIVE_LABEL);
  });

  it('/app and /r (live): public data of the Receita, never "dados sintéticos"', async () => {
    const html = await render(true);
    expect(html).toContain(LIVE_LABEL);
    expect(html).not.toContain('Dados sintéticos');
  });

  it('the action plan names the finding by its title, never by its rule code', async () => {
    const html = await render(undefined);
    const plan = html.slice(html.indexOf('data-testid="report-plan"'));
    expect(plan).not.toMatch(/\((R0\d|R05-REC|A01)\)/);
  });
});
