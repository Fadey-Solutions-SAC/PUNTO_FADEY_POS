"use client";

import Badge from "lucide-react/icons/badge";
import Building2 from "lucide-react/icons/building-2";
import CreditCard from "lucide-react/icons/credit-card";
import Download from "lucide-react/icons/download";
import FileText from "lucide-react/icons/file-text";
import History from "lucide-react/icons/history";
import ImageIcon from "lucide-react/icons/image";
import Palette from "lucide-react/icons/palette";
import Printer from "lucide-react/icons/printer";
import Store from "lucide-react/icons/store";
import Users from "lucide-react/icons/users";
import Wallet from "lucide-react/icons/wallet";
import Warehouse from "lucide-react/icons/warehouse";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

const ICONS: Record<string, Icon> = {
  apariencia: Palette,
  logo: Badge,
  portada: ImageIcon,
  negocio: Store,
  pagos: CreditCard,
  sucursales: Warehouse,
  otro: Building2,
  usuarios: Users,
  cajas: Wallet,
  impresion: Printer,
  facturacion: FileText,
  copia: Download,
  auditoria: History,
};

const GROUP_NOTE: Record<string, string> = {
  Apariencia: "Color, logo y portada",
  Negocio: "Datos del local",
  Equipo: "Usuarios y cajas",
  Sistema: "Impresión, facturación, copia y auditoría",
};

export type SettingsItem = { id: string; group: string; label: string };

export function SettingsBoard({ items, sections }: { items: SettingsItem[]; sections: Record<string, ReactNode> }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, SettingsItem[]>();
    for (const item of items) {
      if (!map.has(item.group)) {
        order.push(item.group);
        map.set(item.group, []);
      }
      map.get(item.group)?.push(item);
    }
    return order.map((title) => ({ title, items: map.get(title) ?? [] }));
  }, [items]);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div aria-label="Opciones de configuración" className="pf-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden">
        {items.map((item) => {
          const Icon = ICONS[item.id] ?? Store;
          const on = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => setActive(item.id)}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium shadow-sm ${on ? "bg-[var(--pf-panel)] text-[var(--pf-panel-ink)]" : "border border-slate-200 bg-white text-slate-700"}`}
            >
              <Icon size={16} strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}
      </div>
      <nav aria-label="Opciones de configuración" className="pf-scroll hidden w-64 shrink-0 overflow-y-auto rounded-2xl bg-[var(--pf-panel)] py-3 text-[var(--pf-panel-soft)] md:sticky md:top-0 md:block md:max-h-[calc(100vh-6.5rem)]">
        <div className="space-y-5 px-3">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="mb-1.5 px-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pf-panel-dim)]">{group.title}</p>
                {GROUP_NOTE[group.title] ? <p className="mt-0.5 text-[11px] leading-snug text-[var(--pf-panel-dim)]">{GROUP_NOTE[group.title]}</p> : null}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = ICONS[item.id] ?? Store;
                  const on = item.id === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setActive(item.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] transition ${on ? "bg-[var(--pf-panel-hover)] text-[var(--pf-panel-ink)]" : "text-[var(--pf-panel-soft)] hover:bg-[var(--pf-panel-hover)] hover:text-[var(--pf-panel-ink)]"}`}
                    >
                      <Icon size={18} strokeWidth={1.75} className={on ? "text-[var(--pf-panel-ink)]" : "text-[var(--pf-panel-dim)]"} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1">
        {items.map((item) => (
          <div key={item.id} hidden={item.id !== active}>
            {sections[item.id]}
          </div>
        ))}
      </div>
    </div>
  );
}
