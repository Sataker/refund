import type { Metadata } from 'next';
import { NotFoundPage } from '@/components/brand/not-found-page';

export const metadata: Metadata = {
  title: 'Página não encontrada · Refund',
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundPage />;
}
