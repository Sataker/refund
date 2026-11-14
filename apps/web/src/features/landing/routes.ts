import type { Route } from 'next';

// Routes the landing links to before they exist (typedRoutes would reject the literals). /demo arrives with
// E12; the support pages with the stage that builds them (EXECUTION, "/como-funciona, /seguranca, /motor,
// /status, /privacidade, /termos"). Remove the casts as each route lands.
export const ROUTES = {
  demo: '/demo' as Route,
  security: '/seguranca' as Route,
  howItWorks: '/como-funciona' as Route,
  engine: '/motor' as Route,
  status: '/status' as Route,
  privacy: '/privacidade' as Route,
  terms: '/termos' as Route,
} as const;
