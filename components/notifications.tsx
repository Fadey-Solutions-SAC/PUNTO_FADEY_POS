"use client";

import type { NoticeKind, SystemNotice } from "@/lib/notices";
import Bell from "lucide-react/icons/bell";
import CalendarClock from "lucide-react/icons/calendar-clock";
import PackageX from "lucide-react/icons/package-x";
import TriangleAlert from "lucide-react/icons/triangle-alert";
import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType } from "react";

const SEEN_VERSION = "fadey-version";
const SEEN_RELEASE = "fadey-release";
const RELEASE_ID = "requerimiento-recepcion";

const NOTICE_ICON: Record<NoticeKind, { icon: ComponentType<{ size?: number; strokeWidth?: number }>; className: string; label: string }> = {
  out: { icon: PackageX, className: "bg-red-50 text-red-700", label: "Agotado" },
  low: { icon: TriangleAlert, className: "bg-amber-50 text-amber-700", label: "Stock bajo" },
  expiry: { icon: CalendarClock, className: "bg-orange-50 text-orange-700", label: "Vencimiento" },
};

export function Notifications({ notices, version }: { notices: SystemNotice[]; version: string }) {
  const [open, setOpen] = useState(false);
  const [update, setUpdate] = useState(false);
  const [release, setRelease] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const count = notices.length + (update ? 1 : 0) + (release ? 1 : 0);

  useEffect(() => {
    const seen = window.localStorage.getItem(SEEN_VERSION);
    if (seen && seen !== version) setUpdate(true);
    else window.localStorage.setItem(SEEN_VERSION, version);
    setRelease(window.localStorage.getItem(SEEN_RELEASE) !== RELEASE_ID);
  }, [version]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function applyUpdate() {
    window.localStorage.setItem(SEEN_VERSION, version);
    window.location.reload();
  }

  function dismissRelease() {
    window.localStorage.setItem(SEEN_RELEASE, RELEASE_ID);
    setRelease(false);
  }

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        className="relative rounded-lg p-1.5 text-[var(--pf-panel-soft)] hover:bg-[var(--pf-panel-hover)]"
        aria-label="Notificaciones"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={16} />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-warn px-1 text-[10px] font-semibold text-white">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem]">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold text-navy">Notificaciones</p>
            <p className="text-[11px] text-slate-500">Avisos del sistema · versión {version}</p>
          </div>
          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto sm:max-h-[28rem]">
            {release ? (
              <article className="border-b border-slate-100">
                <img src="/updates/requerimiento-recepcion.svg" alt="De Requerimiento, la lista de compra, a Recepción, lo que llegó." className="w-full bg-[#eef3f8]" />
                <div className="px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Nueva función</p>
                  <p className="text-sm font-medium text-navy">Requerimiento y recepción</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">Requerimiento lista lo que falta en el almacén y propone comprar hasta el stock máximo. Recepción usa esa lista: anotas lo que llegó, corriges la cantidad si cambió y registras la compra.</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Link href="/compras/requerimiento" prefetch={process.env.NODE_ENV === "production"} className="pf-button inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium" onClick={() => setOpen(false)}>Ver requerimiento</Link>
                    <button type="button" className="h-8 rounded-lg px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50" onClick={dismissRelease}>Entendido</button>
                  </div>
                </div>
              </article>
            ) : null}
            {update ? (
              <button type="button" className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50" onClick={applyUpdate}>
                <span className="block text-sm font-medium text-navy">Actualización disponible</span>
                <span className="block text-xs text-slate-500">Hay una versión nueva del sistema. Recarga para usarla.</span>
              </button>
            ) : null}
            {notices.length === 0 && !update && !release ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">No hay notificaciones.</p>
            ) : notices.length > 0 ? (
              <div>
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Alertas</p>
                {notices.map((notice) => {
                  const mark = NOTICE_ICON[notice.kind];
                  const Icon = mark.icon;
                  return (
                    <Link
                      key={notice.id}
                      href={notice.href}
                      prefetch={process.env.NODE_ENV === "production"}
                      className="flex items-start gap-2.5 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50"
                      onClick={() => setOpen(false)}
                    >
                      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${mark.className}`} title={mark.label}>
                        <Icon size={16} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-navy">{notice.title}</span>
                        <span className="block text-xs text-slate-500">{notice.detail}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
