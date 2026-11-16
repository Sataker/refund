import { RULE_REFS, type RuleId } from '@refund/engine';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DEMO_PERSONAS, demoPersona } from '@/demo/catalog.ts';
import { personaView } from '@/demo/view.ts';
import { LiveAnalysis, type StageRule } from '@/features/demo/live-analysis.client';

// Screen 4 on /demo (ARCHITECTURE §13 `/demo/[persona]/analise`, §7.3): a static shell; the events come from
// GET /api/demo/analise, which runs the real pipeline at the scripted pace (`?pace=instant` in the tests).

export const dynamicParams = false;

export function generateStaticParams(): { persona: string }[] {
  return DEMO_PERSONAS.map((p) => ({ persona: p.id }));
}

export const metadata: Metadata = {
  title: 'Análise ao vivo · demo · Refund',
  robots: { index: false },
};

/**
 * The rules of stage 3 ("Aplicando 6 regras da lei"): the P0 rules in the combined-scenario order, then the
 * cash alert and the limit (ENGINE-SPEC F.3). Names are plain words; the § comes from each rule's metadata.
 */
const STAGE_RULES: { ruleId: RuleId; name: string }[] = [
  { ruleId: 'R01', name: 'Fator R e pró-labore' },
  { ruleId: 'R05', name: 'Exportação separada' },
  { ruleId: 'R06', name: 'Produtos monofásicos' },
  { ruleId: 'R04', name: 'IRPF do sócio' },
  { ruleId: 'R02', name: 'Dividendos acima de R$ 50 mil' },
  { ruleId: 'R03', name: 'Limite do Simples' },
];

export default async function DemoAnalysisPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const { persona: id } = await params;
  const persona = demoPersona(id);
  if (!persona) notFound();
  const rules: StageRule[] = STAGE_RULES.map((r) => {
    const ref = RULE_REFS[r.ruleId][0];
    return { ...r, lawRef: ref ? { label: ref.label, url: ref.url } : null };
  });
  return (
    <LiveAnalysis
      persona={personaView(persona)}
      rules={rules}
      defaults={{ answers: persona.profileAnswers, pfSkipped: false }}
    />
  );
}
