import { test as base, expect, type Page } from '@playwright/test';

// Network guard for the demo-* projects (TESTS §6): any request to a host other
// than localhost fails the test. It is the proof that /demo needs zero env and
// makes no external call.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocal(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export const test = base.extend<{ networkGuard: undefined }>({
  networkGuard: [
    async ({ page }, use, testInfo) => {
      const external: string[] = [];
      if (testInfo.project.name.startsWith('demo-')) {
        await page.route('**/*', (route) => {
          const url = route.request().url();
          if (isLocal(url)) return route.continue();
          external.push(url);
          return route.abort('blockedbyclient');
        });
      }
      await use(undefined);
      expect(external, 'external network calls are forbidden in /demo').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * The /demo shell lock (ARCHITECTURE §13) sends a visitor who has not finished the track back to it. Tests that
 * open a shell route directly start as a visitor who already watched the analysis (only when no session exists, so
 * the state a test builds survives its own navigations).
 */
export async function unlockShell(page: Page, persona = 'dev-exportador'): Promise<void> {
  await page.addInitScript((p) => {
    try {
      if (localStorage.getItem('refund:demo:session') !== null) return;
      localStorage.setItem('refund:demo:session', 'e2e');
      localStorage.setItem(
        'refund:demo:e2e',
        JSON.stringify({ id: 'e2e', createdAt: 1, personas: { [p]: { trackDone: true } } }),
      );
    } catch {
      // No storage: the page shows the lock redirect and the test fails loudly.
    }
  }, persona);
}
