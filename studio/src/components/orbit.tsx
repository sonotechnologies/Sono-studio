import { Logo } from './logo';

/** The loading mark: the two rings of the logo turning. With reduced motion it gently fades instead. */
export function Orbit({ size = 72 }: { size?: number }) {
  return (
    <div role="img" aria-label="Working" style={{ width: size + 12, height: size + 12 }} className="flex items-center justify-center">
      <div style={{ width: size }} className="sono-orbit">
        <Logo kind="mark" alt="" className="h-auto w-full" />
      </div>
    </div>
  );
}

export function MiniSpin() {
  return <span aria-hidden className="block size-3 animate-spin rounded-full border-[2.5px] border-terracotta border-r-transparent" />;
}
