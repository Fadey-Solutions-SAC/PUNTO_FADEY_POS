"use client";

export function PrintButton() {
  return (
    <button type="button" className="pf-button no-print mt-4 h-10 w-full rounded-xl text-sm font-medium" onClick={() => window.print()}>
      Imprimir
    </button>
  );
}
