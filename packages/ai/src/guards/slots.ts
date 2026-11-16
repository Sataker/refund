// Slot guard (ADR-016): the text a model writes holds no number and no citation at all. Numbers, dates, percentages,
// the anexo and legal references enter only through the placeholders listed for the finding, filled by our code.
// Fail closed and simple: anything number-like or law-like outside a placeholder rejects the text.
import { fold } from './ptbr.ts';

export interface SlotVerdict {
  ok: boolean;
  /** Something number-like (digit, number word, currency, percent, roman numeral). */
  numeric: boolean;
  /** Something law-like (a legal designator, "§", a roman numeral). */
  citation: boolean;
  problems: string[];
}

// Letters allowed: ASCII, Latin-1 and Latin Extended-A (Portuguese and its neighbours). Cyrillic "а" or Greek "ο"
// that look like Latin letters are refused, and so are ª and º ("nº", "1º").
const LETTER_OK = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]$/u;
// Format (zero-width, soft hyphen, bidi), private-use and control characters other than line breaks and tabs.
const INVISIBLE = /[\p{Cf}\p{Co}\p{Cs}]/u;
/** C0 and C1 control characters other than tab and line breaks. */
const isControl = (c: number) =>
  (c < 32 && c !== 9 && c !== 10 && c !== 13) || (c >= 127 && c < 160);
const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

const NUMBER_WORDS = new Set(
  (
    'zero dois duas tres quatro cinco seis sete oito nove dez onze doze treze quatorze catorze quinze dezesseis ' +
    'dezessete dezoito dezenove vinte trinta quarenta cinquenta sessenta setenta oitenta noventa cem cento ' +
    'duzentos duzentas trezentos trezentas quatrocentos quatrocentas quinhentos quinhentas seiscentos seiscentas ' +
    'setecentos setecentas oitocentos oitocentas novecentos novecentas mil milhar milhares milhao milhoes bilhao ' +
    'bilhoes trilhao trilhoes dezena dezenas duzia duzias centena centenas metade dobro triplo quadruplo terco ' +
    'tercos terceiro terceira quarto quarta quinto quinta sexto sexta setimo setima oitavo oitava nono nona ' +
    'decimo decima vigesimo trigesimo centesimo milesimo'
  ).split(' '),
);
const MONEY_WORDS = new Set(
  'reais dolar dolares euro euros brl usd eur centavo centavos porcento percentual percentuais pp'.split(
    ' ',
  ),
);
const DESIGNATORS = new Set(
  (
    'art arts artigo artigos paragrafo paragrafos inciso incisos inc alinea alineas caput lei leis lc decreto ' +
    'decretos dec mp emenda ec constituicao constitucional cf codigo clt sumula tema convenio portaria port res ' +
    'resolucao in normativa rir cgsn cosit ctn stf stj carf re resp adi adin adc ado adpf regulamento estatuto'
  ).split(' '),
);
const PHRASES =
  /(?<![\p{L}])(?:por\s+cento|pontos?\s+percentua(?:l|is)|medida\s+provisoria|solucao\s+de\s+consulta|ato\s+declaratorio|parecer\s+normativo|instrucao\s+normativa)(?![\p{L}])/u;
/** Fixed phrases the explanation copy uses, with "lei" in its plain sense (no law is named). */
const SAFE_PHRASES =
  /(?<![\p{L}])(?:dentro da lei(?=\s*(?:[,.;:)]|$))|a conta e a lei(?=\s+estao(?![\p{L}])))/gu;
// Uppercase and standalone ("XVIII", "V"); a letter after a hyphen is a name part ("PGDAS-D").
const ROMAN = /(?<![\p{L}-])[IVXLCDM]{1,7}(?![\p{L}])/u;

/** Checks a slotted text against the placeholders this finding offers (`allowed`). */
export function slotGuard(text: string, allowed: ReadonlySet<string>): SlotVerdict {
  const problems: string[] = [];
  let numeric = false;
  let citation = false;
  const both = (p: string) => {
    problems.push(p);
    numeric = true;
    citation = true;
  };

  if (INVISIBLE.test(text) || [...text].some((ch) => isControl(ch.codePointAt(0) as number)))
    both('invisible or control character');
  // Ordinal indicators would become "o"/"a" under NFKC ("nº", "1º"): refused before it.
  if (/[ºª°]/.test(text)) both('ordinal or degree sign');
  const normalized = text.normalize('NFKC');
  for (const ch of normalized.match(/\p{L}/gu) ?? [])
    if (!LETTER_OK.test(ch)) {
      both(`letter outside Latin: ${ch}`);
      break;
    }

  for (const m of normalized.matchAll(PLACEHOLDER))
    if (!allowed.has(m[1] as string)) both(`unknown placeholder {{${m[1]}}}`);
  const rest = normalized.replace(PLACEHOLDER, ' ');
  if (/[{}]/.test(rest)) both('malformed placeholder');

  if (/\p{N}/u.test(rest)) {
    numeric = true;
    problems.push('digit');
  }
  if (/[\p{Sc}%‰]/u.test(rest)) {
    numeric = true;
    problems.push('currency or percent sign');
  }
  if (/§/.test(rest)) {
    citation = true;
    problems.push('§');
  }
  if (ROMAN.test(rest)) both('roman numeral');

  const folded = fold(rest).replace(SAFE_PHRASES, ' ');
  if (PHRASES.test(folded)) {
    const isPercent = /cento|percentua/.test(folded);
    if (isPercent) numeric = true;
    else citation = true;
    problems.push('number or legal phrase');
  }
  for (const w of folded.match(/\p{L}+/gu) ?? []) {
    if (NUMBER_WORDS.has(w) || MONEY_WORDS.has(w)) {
      numeric = true;
      problems.push(`word: ${w}`);
    }
    if (DESIGNATORS.has(w)) {
      citation = true;
      problems.push(`legal word: ${w}`);
    }
  }
  return { ok: problems.length === 0, numeric, citation, problems };
}
