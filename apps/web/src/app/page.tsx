import { redirect } from 'next/navigation';

export default function HomePage() {
  // The app-shell layout bounces unauthenticated visitors to /login.
  redirect('/documents');
}
