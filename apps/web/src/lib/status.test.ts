import { describe, expect, it } from 'vitest';
import { STATUS_PAGE_PLACEHOLDER, statusPageUrl } from './status.ts';

describe('statusPageUrl', () => {
  it('links nothing while the constant is the placeholder', () => {
    expect(statusPageUrl(STATUS_PAGE_PLACEHOLDER)).toBeNull();
  });

  it('links the configured page', () => {
    expect(statusPageUrl('https://stats.uptimerobot.com/AbC123')).toBe(
      'https://stats.uptimerobot.com/AbC123',
    );
  });
});
