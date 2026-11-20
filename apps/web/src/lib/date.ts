// Dates on screen are Brasília dates (M7, UX review 19/11): an instant stored in UTC is formatted in
// America/Sao_Paulo, never by slicing its ISO string (22h BRT is already the next day in UTC).

const BRT_DATE = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** An instant (ISO string or Date) → "dd/mm/aaaa" in Brasília time; '' when it is not a date. */
export function formatBrtDate(at: string | Date): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  return Number.isNaN(d.getTime()) ? '' : BRT_DATE.format(d);
}
