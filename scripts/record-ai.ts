// pnpm ai:record (ARCHITECTURE §5.4): runs the real pipeline over the hero persona (both /demo runs: before the
// cards and with every F.2 card answered), captures every LlmPort input and writes
// packages/ai/recordings/<persona>.json. Calls the AI Gateway: never runs in CI.
//
//   AI_GATEWAY_API_KEY=… pnpm ai:record      model explanations; only outputs that pass both guards are recorded,
//                                            a rejected one is recorded as the template and listed below
//   pnpm ai:record --template                no key, no network: every item the model has not written yet is the
//                                            deterministic template (origin "template"); model items are kept
//
// The key is used only from the environment of this shell, never written anywhere.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createLlmPort,
  DEFAULT_BUDGET,
  MODELS,
  parseRecordings,
  type RecordingItem,
  recordingKey,
} from '../packages/ai/src/index.ts';
import {
  buildRecordings,
  capturingPort,
  gatewayClassifyItem,
  gatewayExplainItem,
  templateItem,
  templateRun,
} from '../packages/ai/src/record.ts';
import type { ExplainOutput } from '../packages/ai/src/schemas.ts';
import { heroRuns } from '../packages/ai/test/hero.ts';
import { ENGINE_VERSION, PARAMETERS_VERSION } from '../packages/engine/src/index.ts';
import type { ExplanationInput } from '../packages/pipeline/src/index.ts';
import { biomeFormat } from './generate-fixtures-index.ts';

const PERSONAS = ['dev-exportador'] as const;
const RECORDINGS_DIR = 'packages/ai/recordings';

function die(message: string): never {
  console.error(`ai:record: ${message}`);
  process.exit(1);
}

async function record(persona: string, templateOnly: boolean): Promise<void> {
  const file = join(RECORDINGS_DIR, `${persona}.json`);
  const previous = parseRecordings(JSON.parse(readFileSync(file, 'utf8')), persona);
  const recordedAt = new Date().toISOString();

  // 1. What /demo will ask the port, exactly (the same pipeline, persona and answers).
  const { port: capture, captured } = capturingPort();
  await heroRuns(capture);

  const next: Record<string, RecordingItem> = {};
  const rejected: string[] = [];
  if (templateOnly) {
    Object.assign(next, templateRun(previous, captured, recordedAt));
  } else {
    // 2. The model, behind the guards. Recordings are not replayed here: this run writes them.
    const raw = new Map<ExplanationInput, ExplainOutput>();
    let classifyModel: string = MODELS.classify.primary;
    const port = createLlmPort({
      mode: 'gateway',
      budget: DEFAULT_BUDGET,
      log: (e) => {
        // The model that actually answered (a gateway fallback may have).
        if (e.event === 'ai.call' && e.task === 'classify') classifyModel = e.model;
        console.log(JSON.stringify(e));
      },
      onExplanation: (input, output) => raw.set(input, output),
    });
    for (const input of captured.explain) {
      const out = await port.explain(input);
      const key = recordingKey('explain', input);
      const accepted = raw.get(input);
      if (out.origin === 'llm' && accepted !== undefined) {
        next[key] = gatewayExplainItem(
          input,
          accepted,
          out.model ?? MODELS.explain.primary,
          recordedAt,
        );
      } else {
        rejected.push(
          `${input.finding.ruleId} (numeric ${out.guards.numeric}, citation ${out.guards.citation})`,
        );
        next[key] = templateItem(input, recordedAt);
      }
    }
    // Same batch size as the pipeline (classify/llm.ts: 50).
    for (let i = 0; i < captured.classify.length; i += 50) {
      const batch = captured.classify.slice(i, i + 50);
      classifyModel = MODELS.classify.primary;
      const outputs = await port.classify(batch);
      for (const out of outputs) {
        const input = batch.find((t) => t.transactionId === out.transactionId);
        if (input === undefined) continue;
        next[recordingKey('classify', input)] = gatewayClassifyItem(out, classifyModel, recordedAt);
      }
    }
  }

  const recordings = buildRecordings(previous, next, {
    persona,
    engineVersion: ENGINE_VERSION,
    parametersVersion: PARAMETERS_VERSION,
  });
  writeFileSync(file, `${JSON.stringify(recordings, null, 2)}\n`);
  biomeFormat([file]);

  const items = Object.values(recordings.items);
  const byOrigin = (o: string) => items.filter((i) => i.origin === o).length;
  console.log(
    `ai:record: ${file}: ${items.length} item(s), ${byOrigin('gateway')} from the model, ${byOrigin('template')} from the template`,
  );
  for (const r of rejected)
    console.log(`ai:record: rejected by the guards, template recorded: ${r}`);
}

async function main(): Promise<void> {
  const templateOnly = process.argv.includes('--template');
  // The AI SDK reads the gateway credentials from the environment itself; this only fails fast without them.
  const hasCredentials = ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN'].some(
    (name) => (process.env[name] ?? '') !== '',
  );
  if (!templateOnly && !hasCredentials)
    die(
      'AI_GATEWAY_API_KEY is not set (or run with --template to record the deterministic template)',
    );
  const only = process.argv.find((a) => a.startsWith('--persona='))?.slice('--persona='.length);
  const personas = only === undefined ? PERSONAS : PERSONAS.filter((p) => p === only);
  if (personas.length === 0) die(`unknown persona ${only}`);
  for (const persona of personas) await record(persona, templateOnly);
}

if (import.meta.main) await main();
