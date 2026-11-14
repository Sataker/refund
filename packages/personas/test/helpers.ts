import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceTransaction } from '@refund/sources';
import type { AnswerKey, AnswerKeyTransaction, PersonaData } from '../src/index.ts';

export const DATA_DIR = join(import.meta.dirname, '..', 'data');

export function readCommitted(name: string): string {
  return readFileSync(join(DATA_DIR, name), 'utf8');
}

export const committedData = (): PersonaData =>
  JSON.parse(readCommitted('dev-exportador.json')) as PersonaData;
export const committedAnswerKey = (): AnswerKey =>
  JSON.parse(readCommitted('dev-exportador.answer-key.json')) as AnswerKey;

export interface Row {
  tx: SourceTransaction;
  key: AnswerKeyTransaction;
  holder: 'PF' | 'PJ';
  subtype: string;
}

/** Every transaction joined with its answer-key entry. */
export function rows(data: PersonaData, key: AnswerKey): Row[] {
  const byId = new Map(key.transactions.map((t) => [t.sourceId, t]));
  return data.items.flatMap((item) =>
    item.accounts.flatMap((a) =>
      a.transactions.map((tx) => {
        const k = byId.get(tx.sourceId);
        if (!k) throw new Error(`transaction without an answer-key entry: ${tx.sourceId}`);
        return { tx, key: k, holder: item.holder, subtype: a.account.subtype };
      }),
    ),
  );
}

export const sumOf = (list: Row[]): number => list.reduce((s, r) => s + r.tx.amountCents, 0);

/** ENGINE-SPEC E.1.5: uppercase, no accents, collapsed spaces. */
export function normalize(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
