/** Shown the moment you open a site, while the workspace loads: its three panes in outline. */
export default function Loading() {
  const block = 'rounded-lg bg-hover motion-safe:animate-pulse';
  return (
    <div role="status" aria-label="Loading the workspace" className="flex h-dvh overflow-hidden bg-bg">
      <aside className="hidden w-[300px] flex-none flex-col gap-3 border-r border-border p-5 md:flex">
        <div className={`h-4 w-20 ${block}`} />
        <div className={`h-7 w-40 ${block}`} />
        <div className={`mb-4 h-4 w-32 ${block}`} />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={`h-11 ${block}`} />
        ))}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 flex-none items-center gap-3 border-b border-border px-4">
          <div className={`h-9 w-28 ${block}`} />
          <div className="flex-1" />
          <div className={`h-10 w-28 rounded-full ${block}`} />
        </div>
        <div className="flex-1 bg-stage p-4 md:p-8">
          <div className={`mx-auto h-full max-w-[900px] rounded-xl ${block}`} />
        </div>
      </main>
      <aside className="hidden w-[380px] flex-none flex-col gap-3 border-l border-border p-5 lg:flex">
        <div className={`h-6 w-64 ${block}`} />
        <div className={`mt-4 h-24 ${block}`} />
        <div className={`h-16 ${block}`} />
      </aside>
    </div>
  );
}
