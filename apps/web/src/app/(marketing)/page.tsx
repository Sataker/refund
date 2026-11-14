import {
  CalcSection,
  FaqSection,
  FinalCtaSection,
  HeroSection,
  HowItWorksSection,
  ProblemSection,
  ProofSection,
  SecuritySection,
  SiteFooter,
  SiteHeader,
} from '@/features/landing/sections';

// Landing (IDENTITY-AND-UI Screen 0 + §5.12). Static: every number is resolved at build time.
export default function Home() {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
      >
        Pular para o conteúdo
      </a>
      <SiteHeader />
      <main id="conteudo">
        <HeroSection />
        <ProofSection />
        <ProblemSection />
        <HowItWorksSection />
        <CalcSection />
        <SecuritySection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <SiteFooter />
    </>
  );
}
