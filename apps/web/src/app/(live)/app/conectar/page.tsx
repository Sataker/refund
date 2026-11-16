import { redirect } from 'next/navigation';

// Screen 3 is the track's `conta-pj` / `conta-pf` steps since D19 (ARCHITECTURE §13).
export default function ConnectPage(): never {
  redirect('/app/comecar/conta-pj');
}
