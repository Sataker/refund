import 'server-only';
import { capabilitiesFrom } from '../capabilities.ts';
import { readEnv } from '../env.ts';
import { abacatePayHttp, type KeyMode, keyModeOf, type PixGateway } from './abacatepay.ts';

// ARCHITECTURE §4.10: `payments` = ABACATEPAY_API_KEY && ABACATEPAY_WEBHOOK_SECRET. Without them there is no gateway,
// the plans page shows the prices with Pix off, and the build never needs them.

export interface PaymentsConfig {
  gateway: PixGateway;
  webhookSecret: string;
  keyMode: KeyMode;
}

export function paymentsConfig(): PaymentsConfig | null {
  const env = readEnv();
  const e = env.values;
  if (!capabilitiesFrom(env).payments || !e.ABACATEPAY_API_KEY || !e.ABACATEPAY_WEBHOOK_SECRET) {
    return null;
  }
  return {
    gateway: abacatePayHttp({
      apiKey: e.ABACATEPAY_API_KEY,
      ...(e.ABACATEPAY_API_BASE_URL ? { baseUrl: e.ABACATEPAY_API_BASE_URL } : {}),
    }),
    webhookSecret: e.ABACATEPAY_WEBHOOK_SECRET,
    keyMode: keyModeOf(e.ABACATEPAY_API_KEY),
  };
}
