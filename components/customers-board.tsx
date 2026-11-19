"use client";

import { saveCustomerAction } from "@/actions/operations";
import { SimpleForm } from "@/components/forms";
import { Button, Field, Label, Table } from "@/components/ui";
import Plus from "lucide-react/icons/plus";
import Search from "lucide-react/icons/search";
import { useMemo, useState } from "react";

type CustomerRow = {
  id: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  debt: string;
  limit: string;
};

export function CustomersBoard({ rows }: { rows: CustomerRow[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return rows;
    return rows.filter((row) =>
      [row.name, row.document, row.phone, row.email].some((value) => value.toLowerCase().includes(text)),
    );
  }, [query, rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <Button type="button" className="shrink-0" onClick={() => setOpen(true)}>
          <Plus size={16} className="mr-1 inline" />
          Nuevo cliente
        </Button>
      </div>
      <Table
        columns={["Nombre", "Documento", "Teléfono", "Correo", "Deuda", "Límite"]}
        rows={filtered.map((customer) => ({
          key: customer.id,
          cells: [customer.name, customer.document, customer.phone, customer.email, customer.debt, customer.limit],
        }))}
      />
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-navy/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo cliente"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--pf-shadow)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-navy">Nuevo cliente</h2>
              <button type="button" className="text-sm text-slate-500" onClick={() => setOpen(false)}>Cerrar</button>
            </div>
            <SimpleForm
              action={async (prev, formData) => {
                const result = await saveCustomerAction(prev, formData);
                if (!result.error) setOpen(false);
                return result;
              }}
              submit="Guardar cliente"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Nombre</Label><Field name="name" required /></div>
                <div><Label>Documento</Label><Field name="document" /></div>
                <div><Label>Teléfono</Label><Field name="phone" /></div>
                <div><Label>Correo</Label><Field name="email" type="email" /></div>
                <div><Label>Dirección</Label><Field name="address" /></div>
                <div><Label>Límite de crédito</Label><Field name="creditLimit" defaultValue="0" /></div>
              </div>
            </SimpleForm>
          </div>
        </div>
      ) : null}
    </div>
  );
}
