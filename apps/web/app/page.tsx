import { redirect } from 'next/navigation';

/** La raíz redirige al dashboard (middleware protege si no está autenticado). */
export default function HomePage() {
  redirect('/dashboard');
}
