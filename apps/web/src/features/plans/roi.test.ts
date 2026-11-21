import { describe, expect, it } from 'vitest';
import { loginPathOf, RETURN_PATH, safePlansPath, safeReturnPath } from './return-path';
import { monthlyCents, parseCheckoutIntent, roiHeadline, roiMultiple, unlockHref } from './roi';

const EMPRESA_YEARLY = 59_900;

describe('roiMultiple (D58: the minimum pays the plan N times, floored)', () => {
  it('floors the multiple, never rounding up', () => {
    expect(roiMultiple(4_000_000, EMPRESA_YEARLY)).toBe(66);
    // ENGINE-SPEC C.11.10 hero minimum, R$ 12.463,38: 20,8× → 20.
    expect(roiMultiple(1_246_338, EMPRESA_YEARLY)).toBe(20);
    expect(roiMultiple(6_231_800, EMPRESA_YEARLY)).toBe(104);
  });

  it('exactly the price is 1×; one cent below is no claim at all', () => {
    expect(roiMultiple(EMPRESA_YEARLY, EMPRESA_YEARLY)).toBe(1);
    expect(roiMultiple(EMPRESA_YEARLY - 1, EMPRESA_YEARLY)).toBeNull();
  });

  it('a zero or missing estimate makes no ROI claim', () => {
    expect(roiMultiple(0, EMPRESA_YEARLY)).toBeNull();
    expect(roiMultiple(null, EMPRESA_YEARLY)).toBeNull();
    expect(roiMultiple(undefined, EMPRESA_YEARLY)).toBeNull();
  });

  it('refuses a missing or zero price and anything that is not integer cents', () => {
    expect(roiMultiple(4_000_000, 0)).toBeNull();
    expect(roiMultiple(4_000_000, null)).toBeNull();
    expect(roiMultiple(4_000_000.5, EMPRESA_YEARLY)).toBeNull();
    expect(roiMultiple(-4_000_000, EMPRESA_YEARLY)).toBeNull();
    expect(roiMultiple(Number.MAX_SAFE_INTEGER + 1, EMPRESA_YEARLY)).toBeNull();
  });

  it('stays exact at the edge of safe integers', () => {
    expect(roiMultiple(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('monthlyCents', () => {
  it('a twelfth of the year, floored to the cent', () => {
    expect(monthlyCents(1_246_338)).toBe(103_861);
    expect(monthlyCents(1_200)).toBe(100);
    expect(monthlyCents(11)).toBe(0);
    expect(monthlyCents(0)).toBe(0);
  });

  it('is 0 for anything that is not integer cents', () => {
    expect(monthlyCents(-1_200)).toBe(0);
    expect(monthlyCents(1.5)).toBe(0);
  });
});

describe('the checkout intent (?assinar=)', () => {
  it('accepts only a Pix plan with monthly or yearly', () => {
    expect(parseCheckoutIntent('business-yearly')).toEqual({ plan: 'business', period: 'yearly' });
    expect(parseCheckoutIntent('mei-monthly')).toEqual({ plan: 'mei', period: 'monthly' });
    for (const bad of [
      'business-validation',
      'accountant_pro-yearly',
      'free-monthly',
      'business-yearly ',
      'business',
      '',
      undefined,
      ['business-yearly'],
    ])
      expect(parseCheckoutIntent(bad)).toBeNull();
  });

  it('the unlock link carries the intent and an encoded way back that the plans page accepts', () => {
    const href = unlockHref('/app/comecar/estimativa');
    expect(href).toBe('/app/plano?assinar=business-yearly&voltar=%2Fapp%2Fcomecar%2Festimativa');
    const url = new URL(href, 'https://example.test');
    expect(parseCheckoutIntent(url.searchParams.get('assinar'))).toEqual({
      plan: 'business',
      period: 'yearly',
    });
    expect(safeReturnPath(url.searchParams.get('voltar'))).toBe('/app/comecar/estimativa');
  });
});

describe('the way back (no open redirect)', () => {
  const id = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
  it('accepts the estimate and the analysis screens only', () => {
    for (const ok of [
      '/app/comecar/estimativa',
      `/app/analises/${id}`,
      `/app/analises/${id}/painel`,
      `/app/analises/${id}/achados/${id}`,
    ])
      expect(RETURN_PATH.test(ok)).toBe(true);
    for (const bad of [
      '//evil.test',
      'https://evil.test/app/comecar/estimativa',
      '/app/comecar/cnpj',
      '/app/comecar/estimativa/../../x',
      `/app/analises/${id}/x`,
      '/app',
      null,
    ])
      expect(safeReturnPath(bad)).toBeNull();
  });
});

describe('roiHeadline (plans page, D58 review H1 and M2)', () => {
  it('the estimate: "Retorno de N× para <empresa>", no article, from the minimum', () => {
    expect(
      roiHeadline(
        { kind: 'estimate', cents: 1_246_338, example: false },
        EMPRESA_YEARLY,
        'Marina Dev',
      ),
    ).toMatchObject({
      title: 'Retorno de 20× para Marina Dev',
      multiple: 20,
      cents: 1_246_338,
    });
  });

  it('a confirmed total reads "confirmados"; on example statements it says so and never "confirmados"', () => {
    const own = roiHeadline(
      { kind: 'confirmed', cents: 6_231_892, example: false },
      EMPRESA_YEARLY,
      'Marina Dev',
    );
    expect(own?.title).toBe('Retorno de 104× para Marina Dev');
    expect(own?.line).toMatch(/^R\$\s62\.318 confirmados nos próximos 12 meses/);
    const sample = roiHeadline(
      { kind: 'confirmed', cents: 6_231_892, example: true },
      EMPRESA_YEARLY,
      'Clínica Exemplo',
    );
    expect(sample?.title).toBe('No extrato de exemplo: retorno de 104× para Clínica Exemplo');
    expect(sample?.line).toContain('extrato de exemplo');
    expect(sample?.line).not.toContain('confirmados');
  });

  it('no basis, or savings below the price: no headline at all', () => {
    expect(roiHeadline(null, EMPRESA_YEARLY, 'Marina Dev')).toBeNull();
    expect(
      roiHeadline({ kind: 'confirmed', cents: 59_899, example: false }, EMPRESA_YEARLY, 'X'),
    ).toBeNull();
    expect(
      roiHeadline({ kind: 'estimate', cents: 0, example: false }, EMPRESA_YEARLY, 'X'),
    ).toBeNull();
  });
});

describe('loginPathOf (review M6: only /auth/entrar with a safe voltar)', () => {
  const err = (login: unknown, code = 'UNAUTHENTICATED') => ({ code, message: 'x', login });

  it('follows the auth PR contract', () => {
    for (const ok of [
      '/auth/entrar?voltar=%2Fapp%2Fplano',
      '/auth/entrar?voltar=/app/plano',
      '/auth/entrar?voltar=%2Fapp%2Fplano%3Fassinar%3Dbusiness-yearly',
      '/auth/entrar?voltar=/app/plano?assinar=business-yearly',
      '/auth/entrar?voltar=%2Fapp%2Fcomecar%2Festimativa',
    ])
      expect(loginPathOf(err(ok))).toBe(ok);
  });

  it('refuses anything that could leave the site or land elsewhere', () => {
    for (const bad of [
      '//evil.test/auth/entrar?voltar=/app/plano',
      'https://evil.test/auth/entrar?voltar=/app/plano',
      '/auth/../x',
      '/auth/entrar/../../x?voltar=/app/plano',
      '/auth/login?next=/app/plano',
      '/auth/entrar',
      '/auth/entrar?voltar=https%3A%2F%2Fevil.test',
      '/auth/entrar?voltar=%2F%2Fevil.test',
      '/auth/entrar?voltar=/app/plano&next=//evil.test',
      '/auth/entrar?voltar=/app/plano?assinar=api-yearly',
      '/auth/entrar?voltar=/app/plano#x',
      '\\evil.test',
      null,
      42,
    ])
      expect(loginPathOf(err(bad))).toBeNull();
  });

  it('ignores the login path of any other error code', () => {
    for (const code of ['NOT_CONFIGURED', 'PLAN_LIMIT', 'FORBIDDEN', 'unauthenticated'])
      expect(loginPathOf(err('/auth/entrar?voltar=/app/plano', code))).toBeNull();
  });

  it('the plans path takes only a valid assinar and a safe voltar', () => {
    expect(safePlansPath('/app/plano')).toBe('/app/plano');
    expect(
      safePlansPath('/app/plano?assinar=mei-monthly&voltar=%2Fapp%2Fcomecar%2Festimativa'),
    ).not.toBeNull();
    expect(safePlansPath('/app/plano?oferta=validacao')).toBeNull();
    expect(safePlansPath('/app/planos')).toBeNull();
  });
});
