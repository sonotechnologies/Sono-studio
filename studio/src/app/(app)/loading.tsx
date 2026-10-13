/** Shown the moment you click, while the page loads: the sidebar stays and the page area shows its outline. */
export default function Loading() {
  const block = 'rounded-card bg-hover motion-safe:animate-pulse';
  return (
    <div role="status" aria-label="Loading" className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-16 flex-none items-center gap-3 border-b border-border px-4 md:px-7">
        <div className={`h-6 w-48 ${block}`} />
      </div>
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-7 px-4 pt-5 md:px-7 md:pt-8">
        <div className={`h-5 w-full max-w-[560px] ${block}`} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-[18px]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`h-[220px] ${block}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
