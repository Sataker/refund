// TESTS §3.5 "false positives": explanations the way a model writes them about the hero (ENGINE-SPEC F.3), with
// "art. 18, § 5º-J", years, "12 meses" and rounded amounts ("cerca de R$ 42,9 mil"). Hand-written stand-ins until
// `pnpm ai:record` produces real ones; guards.test.ts also runs every gateway-recorded text it finds.
export const REAL_EXPLANATIONS: { ruleId: string; text: string }[] = [
  {
    ruleId: 'R01',
    text: 'Você pode pagar R$ 28.316,52 a menos nos próximos 12 meses aumentando seu pró-labore de R$ 1.621,00 para R$ 2.260,00 por mês. Com isso, a folha passa de 28% da receita e a empresa sai do Anexo V para o Anexo III a partir de abril de 2027 (LC 123/2006, art. 18, § 5º-J).',
  },
  {
    ruleId: 'R01',
    text: 'Hoje o Fator R da empresa está em 27%, abaixo dos 28% que a lei pede para o Anexo III (art. 18, § 5º-J e § 5º-M da LC 123). Subindo o pró-labore para R$ 2.260,00, ele chega a 28% em 04/2027. O INSS sobe um pouco, mas a conta já desconta isso: são R$ 28.316,52 a menos em 12 meses.',
  },
  {
    ruleId: 'R01',
    text: 'Depois que o regime se acomoda, a economia fica em cerca de R$ 42,9 mil por ano, a partir de abril de 2027.',
  },
  {
    ruleId: 'R01',
    text: 'O custo dos próximos 12 meses cai de R$ 109.239,72 para R$ 80.923,20, já somando DAS, INSS do sócio e IR.',
  },
  {
    ruleId: 'R01',
    text: 'A receita dos últimos 12 meses foi de R$ 600 mil e a folha sem o pró-labore, de R$ 146.880,00. Com 1 p.p. de folga, o pró-labore recomendado é R$ 2.260,00 por mês.',
  },
  {
    ruleId: 'R01',
    text: 'Em 2026 você pagou o DAS pelo Anexo V. Pagando o pró-labore de R$ 2.260,00 todo mês, com o INSS recolhido, o DAS dos próximos 12 meses cai de R$ 107.100,00 para R$ 77.940,00.',
  },
  {
    ruleId: 'R01',
    text: 'Fator R projetado de 28% a partir do PA 04/2027 (LC 123/2006, art. 18, §§ 5º-J e 5º-M; Res. CGSN 140/2018, art. 26). Pró-labore recomendado: R$ 2.260,00; INSS do sócio em 12 meses: R$ 2.983,20.',
  },
  {
    ruleId: 'R01',
    text: 'Você pode pagar R$ 28.316 a menos em 12 meses, com o pró-labore em R$ 2.260 por mês.',
  },
  {
    ruleId: 'R01',
    text: 'Desde 2026 o Fator R fica abaixo de 28%. A regra do art. 18, § 5º-J, olha a folha dos 12 meses anteriores; por isso a economia começa em 04/2027 e soma R$ 28.316,52 nos próximos 12 meses.',
  },
  {
    ruleId: 'R05',
    text: 'Sua receita vem de clientes no exterior, e exportação de serviço não paga PIS, Cofins nem ISS no Simples (LC 123/2006, art. 18, § 14). Declarando essa receita como exportação no PGDAS-D, você pode pagar R$ 34.002,40 a menos nos próximos 12 meses.',
  },
  {
    ruleId: 'R05',
    text: 'O DAS mensal cai de R$ 8.925,00 para R$ 5.609,36 enquanto a empresa estiver no Anexo V, e de R$ 5.280,00 para R$ 2.687,52 no Anexo III.',
  },
  {
    ruleId: 'R05',
    text: 'Em regime, são cerca de R$ 31,1 mil por ano a menos.',
  },
  {
    ruleId: 'R05',
    text: 'A partir de 01/2027, a CBS e o IBS também saem do DAS de quem exporta serviço consumido lá fora (LC 214/2025, art. 80).',
  },
  {
    ruleId: 'R05',
    text: 'Segregando a exportação, a economia é de cerca de R$ 34 mil em 12 meses (Res. CGSN 140/2018, art. 25, § 3º).',
  },
  {
    ruleId: 'R05-REC',
    text: 'Nos 12 meses do extrato, a empresa pagou R$ 3.315,64 a mais por mês porque a exportação não foi segregada. Isso dá R$ 39.787,68 e, se o mesmo padrão vale para os 48 meses anteriores, até R$ 198.938,40 para pedir de volta (CTN, art. 168).',
  },
  {
    ruleId: 'R05-REC',
    text: 'Da diferença de cada mês, R$ 1.619,89 é de tributos federais e R$ 1.695,75 é de ISS, do município. O pedido do mês mais antigo vence em 23/11/2026.',
  },
  {
    ruleId: 'R05-REC',
    text: 'A faixa vai de R$ 39,8 mil a R$ 198,9 mil, sem a correção pela Selic (Res. CGSN 140/2018, arts. 128 e 131).',
  },
  {
    ruleId: 'R02',
    text: 'Em 07/2026 a empresa distribuiu R$ 90.000,00 e reteve R$ 9.000,00 de IR (Lei 9.250/1995, art. 6º-A). Esse dinheiro volta na declaração de 2027, mas fica parado 10 meses: com a Selic de 15% ao ano, isso custa R$ 1.111,70.',
  },
  {
    ruleId: 'R02',
    text: 'Distribuindo até R$ 50 mil por mês, por exemplo 2 × R$ 45.000,00, não há retenção e o dinheiro fica com você.',
  },
  {
    ruleId: 'R02',
    text: 'Retenção de R$ 9.000,00 sobre R$ 90.000,00 distribuídos em 07/2026 (Lei 9.250/1995, art. 6º-A), compensada no ajuste anual (Lei 9.250/1995, art. 16-A, § 6º).',
  },
];

/** TESTS §3.5 "poisoning": each must fail its guard for the finding it is checked against. */
export const POISONED: { ruleId: string; text: string; guard: 'numeric' | 'citation' }[] = [
  {
    ruleId: 'R01',
    text: 'Você pode pagar R$ 31.000,00 a menos nos próximos 12 meses.',
    guard: 'numeric',
  },
  { ruleId: 'R01', text: 'A alíquota efetiva cai para 6% no Anexo III.', guard: 'numeric' },
  { ruleId: 'R01', text: 'Economia de 35% no imposto da empresa.', guard: 'numeric' },
  { ruleId: 'R05', text: 'Você recupera 9.999,99 por mês.', guard: 'numeric' },
  { ruleId: 'R05', text: 'São cerca de R$ 35 mil por ano a menos.', guard: 'numeric' },
  { ruleId: 'R05-REC', text: 'Até R$ 1,2 mi para recuperar.', guard: 'numeric' },
  { ruleId: 'R02', text: 'O custo é de 1.500 reais por ano.', guard: 'numeric' },
  { ruleId: 'R01', text: 'Isso está no art. 999 da LC 123.', guard: 'citation' },
  { ruleId: 'R01', text: 'Base: Lei 12.345/2020.', guard: 'citation' },
  { ruleId: 'R01', text: 'Vale a LC 123/2006, art. 3º, § 14.', guard: 'citation' },
  { ruleId: 'R02', text: 'Planejamento abusivo é vedado (CTN, art. 116).', guard: 'citation' },
  { ruleId: 'R05', text: 'Veja a Lei Complementar nº 128.', guard: 'citation' },
  { ruleId: 'R05', text: 'Conforme a IN RFB 2.110.', guard: 'citation' },
  { ruleId: 'R01', text: 'O § 5º-Z do art. 18 resolve.', guard: 'citation' },
];
