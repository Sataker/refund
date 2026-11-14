import { test as base, expect } from '@playwright/test';

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
