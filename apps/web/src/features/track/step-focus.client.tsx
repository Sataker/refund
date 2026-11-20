'use client';

import { useEffect } from 'react';

// M5 (UX review 19/11): keyboard users land on the step, not at the top of the page. On each step mount, focus the
// chip the keyboard would start on, or else the step's title; a field that focused itself (the CNPJ) is left alone.

export function StepFocus() {
  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const target =
      document.querySelector<HTMLElement>('[data-testid="choice-group"] button[tabindex="0"]') ??
      document.getElementById('step-title');
    target?.focus({ preventScroll: true });
  }, []);
  return null;
}
