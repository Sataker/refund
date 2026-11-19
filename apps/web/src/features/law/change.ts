import type { EngineResult } from '@refund/engine';
import { RULE_REFS, rulesByRef } from '@refund/engine';
import { type Provision, type Regulation, regulation, regulations } from '@refund/law';

// "Law changed" (ARCHITECTURE §2.6; ADR-013), shared by the webhook and /demo: which corpus provisions a page diff
// touches, which rules read them (engine `rulesByRef`) and, in /demo, the delta of a labelled simulation. Pure: the
// diff never changes a parameter; it only points at what a person must review.

/** Shortest changed line used to match a provision (a stray word would match everything). */
const MIN_MATCH_CHARS = 24;

const normalize = (s: string): string =>
  s
    .normalize('NFC')
    .replace(/[*_`>#]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const canonicalUrl = (url: string): string | null => {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return null;
  }
};

/** The monitored regulation whose page is `url` (scheme, `www.`, query and trailing slash ignored). */
export function regulationOfUrl(url: string): Regulation | undefined {
  const key = canonicalUrl(url);
  return key === null ? undefined : regulations.find((r) => canonicalUrl(r.url) === key);
}

export interface DiffLines {
  removed: string[];
  added: string[];
}

/** Changed lines of a unified diff (headers `---`/`+++` and hunk markers skipped). */
export function diffLines(diffText: string): DiffLines {
  const removed: string[] = [];
  const added: string[] = [];
  for (const line of diffText.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    if (line.startsWith('-')) removed.push(line.slice(1).trim());
    else if (line.startsWith('+')) added.push(line.slice(1).trim());
  }
  return { removed, added };
}

/** A changed line belongs to a provision when one holds the other (old wording: removed lines; new: added). */
function touches(p: Provision, line: string): boolean {
  const l = normalize(line);
  if (l.length < MIN_MATCH_CHARS) return false;
  const text = normalize(p.text);
  return text.includes(l) || l.includes(text.slice(0, Math.max(MIN_MATCH_CHARS, 80)));
}

/** Ids of the corpus provisions of `regulationId` the diff touches, in corpus order. */
export function affectedArticles(regulationId: string, diffText: string): string[] {
  const reg = regulation(regulationId);
  if (!reg) return [];
  const { removed, added } = diffLines(diffText);
  const lines = [...removed, ...added];
  return reg.provisions.filter((p) => lines.some((l) => touches(p, l))).map((p) => p.id);
}

/** Rules that read any of the provisions (rule metadata or parameters), in the engine's display order. */
export function affectedRules(articleIds: readonly string[]): string[] {
  const rules = new Set(articleIds.flatMap((id) => rulesByRef[id] ?? []));
  return Object.keys(RULE_REFS).filter((r) => rules.has(r));
}

export interface SimulationDelta {
  /** Findings of the affected rules: marginal 12-month value before and after, in cents. */
  findings: { ruleId: string; title: string; beforeCents: number; afterCents: number }[];
  totalBeforeCents: number;
  totalAfterCents: number;
}

/** /demo: the same facts under the official set and under the scenario, compared on the affected rules. */
export function simulationDelta(
  before: EngineResult,
  after: EngineResult,
  rules: readonly string[],
): SimulationDelta {
  const ids = new Set(rules);
  const value = (r: EngineResult, ruleId: string) =>
    r.findings.find((f) => f.ruleId === ruleId)?.marginalValue12m ?? 0;
  const touched = [...new Set([...before.findings, ...after.findings].map((f) => f.ruleId))].filter(
    (id) => ids.has(id),
  );
  return {
    findings: touched.map((ruleId) => ({
      ruleId,
      title:
        (
          after.findings.find((f) => f.ruleId === ruleId) ??
          before.findings.find((f) => f.ruleId === ruleId)
        )?.title ?? ruleId,
      beforeCents: value(before, ruleId),
      afterCents: value(after, ruleId),
    })),
    totalBeforeCents: before.total.savings12m,
    totalAfterCents: after.total.savings12m,
  };
}
