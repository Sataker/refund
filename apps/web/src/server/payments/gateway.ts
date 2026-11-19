import 'server-only';
import { capabilitiesFrom } from '../capabilities.ts';
import { readEnv } from '../env.ts';
import { logger } from '../log.ts';
import { abacatePayHttp, type KeyMode, keyModeOf, type PixGateway } from './abacatepay.ts';

// ARCHITECTURE §4.10: `payments` = ABACATEPAY_API_KEY && ABACATEPAY_WEBHOOK_SECRET. Without them there is no gateway,
// the plans page shows the prices with Pix off, and the build never needs them.

export interface PaymentsConfig {
  gateway: PixGateway;
  webhookSecret: string;
  keyMode: KeyMode;
  /** VALIDATION_OFFER_CODE; null = the R$ 1,00 offer is off. */
  validationCode: string | null;
}

/** The Vercel production deployment (VERCEL_ENV), where only a production key may run. */
export function isProductionDeploy(): boolean {
  return readEnv().values.VERCEL_ENV === 'production';
}

export function paymentsConfig(): PaymentsConfig | null {
  const env = readEnv();
  const e = env.values;
  if (!capabilitiesFrom(env).payments || !e.ABACATEPAY_API_KEY || !e.ABACATEPAY_WEBHOOK_SECRET) {
    return null;
  }
  const keyMode = keyModeOf(e.ABACATEPAY_API_KEY);
  // A Test Mode key in production would let "Simular pagamento" hand out plans (payments review, M2): off.
  if (keyMode === 'test' && e.VERCEL_ENV === 'production') {
    logger.error('payments.test_key_in_production', {});
    return null;
  }
  return {
    gateway: abacatePayHttp({
      apiKey: e.ABACATEPAY_API_KEY,
      ...(e.ABACATEPAY_API_BASE_URL ? { baseUrl: e.ABACATEPAY_API_BASE_URL } : {}),
    }),
    webhookSecret: e.ABACATEPAY_WEBHOOK_SECRET,
    keyMode,
    validationCode: e.VALIDATION_OFFER_CODE ?? null,
  };
}
