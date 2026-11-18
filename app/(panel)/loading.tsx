export default function PanelLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" />
      <div className="h-52 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" />
    </div>
  );
}
