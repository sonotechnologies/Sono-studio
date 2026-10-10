import { redirect } from 'next/navigation';

/** Old address of the manual form; the wizard replaced it in phase 3. */
export default function OldNewProjectPage() {
  redirect('/new');
}
