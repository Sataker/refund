import type { Route } from 'next';

// Routes the landing and the site footer link to (ARCHITECTURE §13). Every one exists, so typedRoutes checks them.
export const ROUTES = {
  demo: '/demo',
  security: '/seguranca',
  howItWorks: '/como-funciona',
  engine: '/motor',
  status: '/status',
  privacy: '/privacidade',
  terms: '/termos',
} as const satisfies Record<string, Route>;
