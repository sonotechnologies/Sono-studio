/* eslint-disable @next/next/no-img-element */

/**
 * Logo files swap to their inverse versions on the dark theme via CSS, so
 * they render correctly on the server before the theme is known.
 * The rings are never recoloured.
 */
type Kind = 'mark' | 'lockup-horizontal' | 'lockup-stacked';

export function Logo({ kind, className, alt = 'Sono Technologies' }: { kind: Kind; className?: string; alt?: string }) {
  return (
    <>
      <img src={`/logo/sono-${kind}.svg`} alt={alt} className={`block flex-none dark:hidden ${className ?? ''}`} />
      <img src={`/logo/sono-${kind}-inverse.svg`} alt={alt} className={`hidden flex-none dark:block ${className ?? ''}`} />
    </>
  );
}
