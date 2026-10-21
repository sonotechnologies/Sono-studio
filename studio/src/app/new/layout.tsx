import { SiteFonts } from '@/components/site-fonts';

/** The wizard shows every style, so it loads every site font. */
export default function NewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteFonts />
      {children}
    </>
  );
}
