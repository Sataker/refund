import type { Route } from 'next';

// Routes the landing links to. /demo exists since E12; the support pages still arrive with the stage that
// builds them (EXECUTION, "/como-funciona, /seguranca, /motor, /status, /privacidade, /termos"), so they keep
// a cast (typedRoutes would reject the literals). Remove each cast as its route lands.
export const ROUTES = {
  demo: '/demo' satisfies Route,
  security: '/seguranca' as Route,
  howItWorks: '/como-funciona' as Route,
  engine: '/motor' as Route,
  status: '/status' as Route,
  privacy: '/privacidade' as Route,
  terms: '/termos' as Route,
} as const;
