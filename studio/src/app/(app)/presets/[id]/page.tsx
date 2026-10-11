import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell';
import { getRepo, requireUser } from '@/lib/auth';
import { StyleEditor } from '../style-editor';

type Props = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: 'Edit style' };

export default async function EditStylePage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const style = UUID.test(id) ? await (await getRepo()).getStyle(id) : null;
  if (!style) notFound();
  return (
    <Page title={style.name} width={1200}>
      <StyleEditor initial={style} />
    </Page>
  );
}
