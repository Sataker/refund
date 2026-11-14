// Applies the theme before the first paint (IDENTITY-AND-UI §5.12: follows the system, toggle overrides).
// A static file because the CSP has no nonce (ADR-014) and inline HTML injection is banned by lint.
(() => {
  const root = document.documentElement;
  let stored = null;
  try {
    stored = window.localStorage.getItem('refund-theme');
  } catch {
    stored = null;
  }
  const dark =
    stored === 'dark' ||
    (stored !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true);
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
})();
