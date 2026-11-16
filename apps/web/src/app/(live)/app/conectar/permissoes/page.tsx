import { redirect } from 'next/navigation';

// Screen 2 is the track's `permissoes` step since D19 (ARCHITECTURE §13).
export default function PermissionsPage(): never {
  redirect('/app/comecar/permissoes');
}
