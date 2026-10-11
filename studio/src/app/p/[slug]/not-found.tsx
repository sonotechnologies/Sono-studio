export default function PitchNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#F7F5F1] p-6 text-center text-[#16140F]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/sono-mark.svg" alt="Sono Technologies" className="h-10 w-auto" />
      <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">This page doesn’t exist</h1>
      <p className="m-0 max-w-[420px] text-[15px] leading-normal text-[#6B665C]">Check the link you were sent, or ask the person who sent it for a new one.</p>
    </main>
  );
}
