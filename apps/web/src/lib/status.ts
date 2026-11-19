// The one place for the public UptimeRobot status page linked from /status (ARCHITECTURE §10.3; IDENTITY-AND-UI §5.14).
// The monitors do not exist yet: `pnpm freeze:check` fails while this placeholder is here (scripts/freeze-check.ts).
export const STATUS_PAGE_PLACEHOLDER = 'STATUS_PENDENTE';
export const STATUS_PAGE_URL: string = STATUS_PAGE_PLACEHOLDER;

/** The URL to link, or null while it is the placeholder (the page then says the status page is not public yet). */
export function statusPageUrl(value: string = STATUS_PAGE_URL): string | null {
  return value === STATUS_PAGE_PLACEHOLDER ? null : value;
}
