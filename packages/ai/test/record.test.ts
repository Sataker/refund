import type { ExplanationInput, LlmClassificationInput } from '@refund/pipeline';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLlmPort, emptyRecordings, recordingKey, templateExplanation } from '../src/index.ts';
import {
  buildRecordings,
  capturingPort,
  gatewayClassifyItem,
  gatewayExplainItem,
  templateItem,
  templateRun,
} from '../src/record.ts';
import { explanationInputs, heroRuns } from './hero.ts';

let inputs: ExplanationInput[];
beforeAll(async () => {
  inputs = explanationInputs((await heroRuns(createLlmPort({ mode: 'template' }))).answered);
}, 60_000);
const r05 = () => inputs.find((i) => i.finding.ruleId === 'R05') as ExplanationInput;
const META = { persona: 'dev-exportador', engineVersion: '1', parametersVersion: '2' };

describe('pnpm ai:record building blocks', () => {
  it('capturingPort keeps each distinct input once and explains with the template', async () => {
    const { port, captured } = capturingPort();
    const input = r05();
    const t: LlmClassificationInput = {
      transactionId: 't',
      redactedDescription: 'x',
      amountCents: 1,
      direction: 'inflow',
      holder: 'PJ',
      method: 'PIX',
      counterpartyType: null,
      counterpartyCnae: null,
      allowedCategories: ['unclassified'],
    };
    expect((await port.explain(input)).text).toBe(templateExplanation(input.finding));
    await port.explain(input);
    expect(await port.classify([t, t])).toEqual([]);
    expect(captured.explain).toHaveLength(1);
    expect(captured.classify).toEqual([t]);
  });

  it('template and gateway items carry their origin and pass the guards', () => {
    const input = r05();
    expect(templateItem(input, 'T')).toMatchObject({
      task: 'explain',
      ruleId: 'R05',
      origin: 'template',
      promptVersion: 'template@2',
      guards: { numeric: 'ok', citation: 'ok' },
    });
    const text = 'Você pode pagar R$ 34.002,40 a menos (LC 123/2006, art. 18, § 14). ';
    expect(
      gatewayExplainItem(input, { text, citedRefIds: ['lc123-2006/art18/p14'] }, 'm', 'T'),
    ).toEqual({
      task: 'explain',
      ruleId: 'R05',
      origin: 'gateway',
      promptVersion: 'explain@2',
      model: 'm',
      recordedAt: 'T',
      output: { text: text.trim(), citedRefIds: ['lc123-2006/art18/p14'] },
      guards: { numeric: 'ok', citation: 'ok' },
    });
    expect(
      gatewayClassifyItem(
        { transactionId: 't', category: 'bank_fee', confidence: 0.9, reason: 'r' },
        'm',
        'T',
      ),
    ).toEqual({
      task: 'classify',
      origin: 'gateway',
      promptVersion: 'classify@1',
      model: 'm',
      recordedAt: 'T',
      output: { category: 'bank_fee', confidence: 0.9, reason: 'r' },
    });
  });

  it('templateRun keeps recorded model items, classifications included (code review 16/11, LOW 5)', () => {
    const input = r05();
    const other = inputs.find((i) => i.finding.ruleId === 'R02') as ExplanationInput;
    const t: LlmClassificationInput = {
      transactionId: 't',
      redactedDescription: 'x',
      amountCents: 1,
      direction: 'inflow',
      holder: 'PJ',
      method: 'PIX',
      counterpartyType: null,
      counterpartyCnae: null,
      allowedCategories: ['unclassified'],
    };
    const model = gatewayExplainItem(input, { text: 'Texto.', citedRefIds: [] }, 'm', 'OLD');
    const cls = gatewayClassifyItem(
      { transactionId: 't', category: 'unclassified', confidence: 0.7, reason: 'r' },
      'm',
      'OLD',
    );
    const previous = {
      ...emptyRecordings('p'),
      items: { [recordingKey('explain', input)]: model, [recordingKey('classify', t)]: cls },
    };
    const next = templateRun(previous, { explain: [input, other], classify: [t] }, 'NEW');
    expect(next[recordingKey('explain', input)]).toBe(model);
    expect(next[recordingKey('classify', t)]).toBe(cls);
    expect(next[recordingKey('explain', other)]).toEqual(templateItem(other, 'NEW'));
  });

  it('buildRecordings: unchanged items keep recordedAt, changed ones are replaced, stale ones dropped', () => {
    const input = r05();
    const key = recordingKey('explain', input);
    const previous = {
      ...emptyRecordings('dev-exportador'),
      items: { [key]: templateItem(input, 'OLD'), 'sha256:stale': templateItem(input, 'OLD') },
    };
    const same = buildRecordings(previous, { [key]: templateItem(input, 'NEW') }, META);
    expect(same).toEqual({
      $format: 'refund.ai-recording/v1',
      ...META,
      items: { [key]: templateItem(input, 'OLD') },
    });
    const changed = gatewayExplainItem(input, { text: 'Texto.', citedRefIds: [] }, 'm', 'NEW');
    expect(buildRecordings(previous, { [key]: changed }, META).items[key]).toBe(changed);
  });
});
