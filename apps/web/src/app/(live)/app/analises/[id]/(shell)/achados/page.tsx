import { redirect } from 'next/navigation';

// The "Achados" nav item: the list lives on the dashboard (Screen 5, #achados).
export default async function LiveFindingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/analises/${id}/painel#achados` as never);
}
