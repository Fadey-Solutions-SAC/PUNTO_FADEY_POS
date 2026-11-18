"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveThemeAction } from "@/actions/operations";
import { THEMES } from "@/lib/themes";

export function AppearancePicker({ current }: { current: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState(current);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  async function choose(id: string) {
    setPending(id);
    setError("");
    const result = await saveThemeAction(id);
    setPending("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSelected(id);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {THEMES.map((theme) => {
          const active = selected === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              disabled={pending !== ""}
              onClick={() => choose(theme.id)}
              className={`rounded-2xl border p-3 text-left transition ${active ? "border-navy ring-2 ring-navy/20" : "border-slate-200 hover:border-slate-300"}`}
            >
              <span className="mb-3 flex h-12 overflow-hidden rounded-xl border border-black/5">
                <span className="w-2/3" style={{ background: theme.panel }} />
                <span className="w-1/3" style={{ background: theme.button }} />
              </span>
              <span className="flex items-center justify-between gap-2 text-sm font-medium text-navy">
                {theme.label}
                <span className="text-xs font-normal text-slate-500">{pending === theme.id ? "Guardando…" : active ? "En uso" : ""}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
