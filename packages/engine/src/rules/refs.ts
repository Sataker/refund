// Rule-level legal references, aligned with the @refund/law corpus ids (EXECUTION §9, E1/E8 row). Generated once
// from packages/law/articles/*.json (label, url, capturedAt, sourceSha256); the engine cannot import @refund/law
// (ARCHITECTURE §3.3, rule 1). E8 adds the test in packages/law/test that every id below exists in the corpus.
import type { LegalRef } from '../types.ts';

const ref = (id: string, label: string, url: string, captureSha256: string): LegalRef => ({
  id,
  label,
  url,
  verifiedAt: '2026-11-14',
  type: 'regulation',
  captureSha256,
});

export const REFS = {
  'lc123-2006/art18/p1-a': ref(
    'lc123-2006/art18/p1-a',
    'LC 123/2006, art. 18, § 1º-A',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
  'lc123-2006/art18/p5-d': ref(
    'lc123-2006/art18/p5-d',
    'LC 123/2006, art. 18, § 5º-D',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
  'lc123-2006/art18/p5-i': ref(
    'lc123-2006/art18/p5-i',
    'LC 123/2006, art. 18, § 5º-I',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
  'lc123-2006/art18/p5-j': ref(
    'lc123-2006/art18/p5-j',
    'LC 123/2006, art. 18, § 5º-J',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
  'lc123-2006/art18/p5-k': ref(
    'lc123-2006/art18/p5-k',
    'LC 123/2006, art. 18, § 5º-K',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
  'lc123-2006/art18/p5-m': ref(
    'lc123-2006/art18/p5-m',
    'LC 123/2006, art. 18, § 5º-M',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
  'lc123-2006/art18/p24': ref(
    'lc123-2006/art18/p24',
    'LC 123/2006, art. 18, § 24',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
  'res-cgsn140-2018/art26': ref(
    'res-cgsn140-2018/art26',
    'Res. CGSN 140/2018, art. 26',
    'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/92278/visao/vigente',
    '51aed0b74a4d8d97ee0158c6c9cca5f14658369b42e07cb345e31007818ec442',
  ),
  'res-cgsn190-2026/art1/res140-art26': ref(
    'res-cgsn190-2026/art1/res140-art26',
    'Res. CGSN 190/2026, art. 1º (art. 26 da Res. CGSN 140/2018)',
    'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/152832',
    '55e08836cba4b3afc78bcd6deb86d9548b9048dd803ee22c3f839c23d487ae40',
  ),
  'lei9250-1995/art3-a': ref(
    'lei9250-1995/art3-a',
    'Lei 9.250/1995, art. 3º-A',
    'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
    '7ae1cbfc64537d9bc4329223a9f25099ed35c52d8b5d3234e03db4b4b0eeaac5',
  ),
  'lei9250-1995/art4/p2': ref(
    'lei9250-1995/art4/p2',
    'Lei 9.250/1995, art. 4º, § 2º',
    'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
    '7ae1cbfc64537d9bc4329223a9f25099ed35c52d8b5d3234e03db4b4b0eeaac5',
  ),
  'lei9250-1995/art10': ref(
    'lei9250-1995/art10',
    'Lei 9.250/1995, art. 10',
    'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
    '7ae1cbfc64537d9bc4329223a9f25099ed35c52d8b5d3234e03db4b4b0eeaac5',
  ),
  'lei9250-1995/art11-a': ref(
    'lei9250-1995/art11-a',
    'Lei 9.250/1995, art. 11-A',
    'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
    '7ae1cbfc64537d9bc4329223a9f25099ed35c52d8b5d3234e03db4b4b0eeaac5',
  ),
  'lei8212-1991/art12/v': ref(
    'lei8212-1991/art12/v',
    'Lei 8.212/1991, art. 12, V',
    'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
    '09224fdf72e6338d34559ee8d7857e8483590772c4ebd38bf5d70dabb02474e5',
  ),
  'lei8212-1991/art21/caput': ref(
    'lei8212-1991/art21/caput',
    'Lei 8.212/1991, art. 21, caput',
    'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
    '09224fdf72e6338d34559ee8d7857e8483590772c4ebd38bf5d70dabb02474e5',
  ),
  'lei8212-1991/art30/p4': ref(
    'lei8212-1991/art30/p4',
    'Lei 8.212/1991, art. 30, § 4º',
    'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
    '09224fdf72e6338d34559ee8d7857e8483590772c4ebd38bf5d70dabb02474e5',
  ),
  'lei10666-2003/art4': ref(
    'lei10666-2003/art4',
    'Lei 10.666/2003, art. 4º',
    'https://www.planalto.gov.br/ccivil_03/leis/2003/l10.666.htm',
    '9e5181c74e9a119f501a1722bad82162552100271cec8f1f58c95dfcdddef45c',
  ),
  'lc123-2006/art3/p14': ref(
    'lc123-2006/art3/p14',
    'LC 123/2006, art. 3º, § 14',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
  'lc123-2006/art3/p15': ref(
    'lc123-2006/art3/p15',
    'LC 123/2006, art. 3º, § 15',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
  'lc123-2006/art18/p4-a': ref(
    'lc123-2006/art18/p4-a',
    'LC 123/2006, art. 18, § 4º-A',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
  'lc123-2006/art18/p14': ref(
    'lc123-2006/art18/p14',
    'LC 123/2006, art. 18, § 14',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
  'res-cgsn140-2018/art16/p3': ref(
    'res-cgsn140-2018/art16/p3',
    'Res. CGSN 140/2018, art. 16, § 3º',
    'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/92278/visao/vigente',
    '51aed0b74a4d8d97ee0158c6c9cca5f14658369b42e07cb345e31007818ec442',
  ),
  'res-cgsn140-2018/art25/p3': ref(
    'res-cgsn140-2018/art25/p3',
    'Res. CGSN 140/2018, art. 25, § 3º',
    'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/92278/visao/vigente',
    '51aed0b74a4d8d97ee0158c6c9cca5f14658369b42e07cb345e31007818ec442',
  ),
  'res-cgsn140-2018/art25/p4': ref(
    'res-cgsn140-2018/art25/p4',
    'Res. CGSN 140/2018, art. 25, § 4º',
    'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/92278/visao/vigente',
    '51aed0b74a4d8d97ee0158c6c9cca5f14658369b42e07cb345e31007818ec442',
  ),
  'res-cgsn140-2018/art25/p4-a': ref(
    'res-cgsn140-2018/art25/p4-a',
    'Res. CGSN 140/2018, art. 25, § 4º-A',
    'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/92278/visao/vigente',
    '51aed0b74a4d8d97ee0158c6c9cca5f14658369b42e07cb345e31007818ec442',
  ),
  'res-cgsn140-2018/art128': ref(
    'res-cgsn140-2018/art128',
    'Res. CGSN 140/2018, art. 128',
    'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/92278/visao/vigente',
    '51aed0b74a4d8d97ee0158c6c9cca5f14658369b42e07cb345e31007818ec442',
  ),
  'res-cgsn140-2018/art131': ref(
    'res-cgsn140-2018/art131',
    'Res. CGSN 140/2018, art. 131',
    'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/92278/visao/vigente',
    '51aed0b74a4d8d97ee0158c6c9cca5f14658369b42e07cb345e31007818ec442',
  ),
  'res-cgsn190-2026/art1/res140-art25': ref(
    'res-cgsn190-2026/art1/res140-art25',
    'Res. CGSN 190/2026, art. 1º (art. 25 da Res. CGSN 140/2018)',
    'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/152832',
    '55e08836cba4b3afc78bcd6deb86d9548b9048dd803ee22c3f839c23d487ae40',
  ),
  'res-cgsn190-2026/art8/xvi': ref(
    'res-cgsn190-2026/art8/xvi',
    'Res. CGSN 190/2026, art. 8º, XVI',
    'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/152832',
    '55e08836cba4b3afc78bcd6deb86d9548b9048dd803ee22c3f839c23d487ae40',
  ),
  'res-cgsn190-2026/art9': ref(
    'res-cgsn190-2026/art9',
    'Res. CGSN 190/2026, art. 9º',
    'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/152832',
    '55e08836cba4b3afc78bcd6deb86d9548b9048dd803ee22c3f839c23d487ae40',
  ),
  'lc116-2003/art2': ref(
    'lc116-2003/art2',
    'LC 116/2003, art. 2º',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm',
    '35df0e43c409293e10fea3c55f1d27a9429205687f6803b0c54c928a5b8248ff',
  ),
  'lc214-2025/art79': ref(
    'lc214-2025/art79',
    'LC 214/2025, art. 79',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm',
    'a501f73cfba1667bb9aa2ded8da364d22f98d43410e73a89faef95287955165e',
  ),
  'lc214-2025/art80': ref(
    'lc214-2025/art80',
    'LC 214/2025, art. 80',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm',
    'a501f73cfba1667bb9aa2ded8da364d22f98d43410e73a89faef95287955165e',
  ),
  'lei10833-2003/art6': ref(
    'lei10833-2003/art6',
    'Lei 10.833/2003, art. 6º',
    'https://www.planalto.gov.br/ccivil_03/leis/2003/l10.833.htm',
    'f82f4212b7e068608e64fdca904660d564d23a8e1bc10a038b7902ae0071597c',
  ),
  'lei10637-2002/art5': ref(
    'lei10637-2002/art5',
    'Lei 10.637/2002, art. 5º',
    'https://www.planalto.gov.br/ccivil_03/leis/2002/l10637.htm',
    'b0d32588230fc21bce2d94b7f51e9b829ca33c4782f45573d8664805b6ebcefd',
  ),
  'lei5172-1966/art168': ref(
    'lei5172-1966/art168',
    'CTN, art. 168',
    'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm',
    '783563120ea06a257dcf3e6a0460ce1ca5525ea30147930845048009e1ba406c',
  ),
  'lei5172-1966/art210': ref(
    'lei5172-1966/art210',
    'CTN, art. 210',
    'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm',
    '783563120ea06a257dcf3e6a0460ce1ca5525ea30147930845048009e1ba406c',
  ),
  'lei810-1949/art1': ref(
    'lei810-1949/art1',
    'Lei 810/1949, art. 1º',
    'https://www.planalto.gov.br/ccivil_03/leis/1930-1949/l810-49.htm',
    'a318c770e992c776d223f245345c4320669e92a25982795734fe366b41ba9035',
  ),
  'lei810-1949/art3': ref(
    'lei810-1949/art3',
    'Lei 810/1949, art. 3º',
    'https://www.planalto.gov.br/ccivil_03/leis/1930-1949/l810-49.htm',
    'a318c770e992c776d223f245345c4320669e92a25982795734fe366b41ba9035',
  ),
  'lei9250-1995/art8/ii': ref(
    'lei9250-1995/art8/ii',
    'Lei 9.250/1995, art. 8º, II',
    'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
    '7ae1cbfc64537d9bc4329223a9f25099ed35c52d8b5d3234e03db4b4b0eeaac5',
  ),
  'lei9250-1995/art8/p2': ref(
    'lei9250-1995/art8/p2',
    'Lei 9.250/1995, art. 8º, § 2º',
    'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
    '7ae1cbfc64537d9bc4329223a9f25099ed35c52d8b5d3234e03db4b4b0eeaac5',
  ),
  'lei9532-1997/art11': ref(
    'lei9532-1997/art11',
    'Lei 9.532/1997, art. 11',
    'https://www.planalto.gov.br/ccivil_03/leis/l9532.htm',
    'd2dab9c28b55fa2e60ab6d992f1d209911983dd69642d312cbeb5c1788455606',
  ),
  'lei11053-2004/art1': ref(
    'lei11053-2004/art1',
    'Lei 11.053/2004, art. 1º',
    'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11053.htm',
    '09a6e4d6c4e98350f9b7d71dbde551b9cba42dd51ad4c9de43643c32b7ce53f4',
  ),
  'lei9250-1995/art6-a': ref(
    'lei9250-1995/art6-a',
    'Lei 9.250/1995, art. 6º-A',
    'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
    '7ae1cbfc64537d9bc4329223a9f25099ed35c52d8b5d3234e03db4b4b0eeaac5',
  ),
  'lei9250-1995/art16-a/p5': ref(
    'lei9250-1995/art16-a/p5',
    'Lei 9.250/1995, art. 16-A, § 5º',
    'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
    '7ae1cbfc64537d9bc4329223a9f25099ed35c52d8b5d3234e03db4b4b0eeaac5',
  ),
  'lei9250-1995/art16-a/p6': ref(
    'lei9250-1995/art16-a/p6',
    'Lei 9.250/1995, art. 16-A, § 6º',
    'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
    '7ae1cbfc64537d9bc4329223a9f25099ed35c52d8b5d3234e03db4b4b0eeaac5',
  ),
  'lc123-2006/art14': ref(
    'lc123-2006/art14',
    'LC 123/2006, art. 14',
    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
  ),
} as const satisfies Record<string, LegalRef>;

export type RefId = keyof typeof REFS;

export const refsOf = (ids: readonly RefId[]): LegalRef[] => ids.map((id) => REFS[id]);
