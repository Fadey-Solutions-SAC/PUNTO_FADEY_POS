import { DocumentLookup } from "./DocumentLookup"

export type CheckoutKind = "NOTA" | "BOLETA" | "FACTURA"
export type CheckoutBuyer = { document: string; name: string; address: string }

const KINDS: { value: CheckoutKind; label: string }[] = [
  { value: "NOTA", label: "Nota de venta" },
  { value: "BOLETA", label: "Boleta" },
  { value: "FACTURA", label: "Factura" },
]

/** Lo que falta para emitir el comprobante elegido (vacío si está bien). totalCents en céntimos. */
export function checkoutProblem(kind: CheckoutKind, buyer: CheckoutBuyer, totalCents: number) {
  if (kind === "NOTA") return ""
  const document = buyer.document.replace(/\D/g, "")
  if (kind === "FACTURA") {
    if (document.length !== 11) return "La factura exige el RUC de 11 dígitos del cliente"
    if (buyer.name.trim().length < 2) return "La factura exige la razón social del cliente"
    return ""
  }
  if (document && document.length !== 8 && document.length !== 11) return "El documento debe ser DNI de 8 dígitos o RUC de 11"
  if (document && buyer.name.trim().length < 2) return "Escribe el nombre del cliente"
  if (!document && totalCents >= 70000) return "Las boletas desde S/ 700 exigen el DNI o RUC del cliente"
  return ""
}

/** Elegir nota de venta, boleta o factura al cobrar (la boleta/factura la emite el asistente local). */
export function CheckoutDocument({
  kind,
  onKind,
  buyer,
  onBuyer,
  disabled = false,
}: {
  kind: CheckoutKind
  onKind: (kind: CheckoutKind) => void
  buyer: CheckoutBuyer
  onBuyer: (buyer: CheckoutBuyer) => void
  disabled?: boolean
}) {
  const field = "mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-200 px-2 text-sm disabled:bg-slate-50"
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">Comprobante</p>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Comprobante">
        {KINDS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={kind === item.value}
            disabled={disabled}
            onClick={() => onKind(item.value)}
            className={`h-9 rounded-lg text-xs font-semibold sm:text-sm ${kind === item.value ? "bg-white text-[var(--pf-navy)] shadow-sm" : "text-slate-500"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {kind === "NOTA" ? null : (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <label className="block text-sm text-slate-700">
            {kind === "FACTURA" ? "RUC" : "DNI o RUC (opcional)"}
            <span className="flex gap-2">
              <input
                placeholder="Ej. 45678912 o 20601234567"
                value={buyer.document}
                disabled={disabled}
                inputMode="numeric"
                maxLength={11}
                onChange={(event) => onBuyer({ ...buyer, document: event.target.value.replace(/\D/g, "") })}
                className={field}
              />
              <DocumentLookup
                value={buyer.document}
                onFound={(party) => onBuyer({ document: party.document, name: party.name, address: party.address || buyer.address })}
              />
            </span>
          </label>
          <label className="block text-sm text-slate-700">
            {kind === "FACTURA" ? "Razón social" : "Nombre"}
            <input value={buyer.name} disabled={disabled} maxLength={200} onChange={(event) => onBuyer({ ...buyer, name: event.target.value })} className={field} placeholder="Ej. Juan Pérez / Comercial SAC" />
          </label>
          <label className="block text-sm text-slate-700">
            Dirección <span className="text-slate-400">(opcional)</span>
            <input value={buyer.address} disabled={disabled} maxLength={300} onChange={(event) => onBuyer({ ...buyer, address: event.target.value })} className={field} placeholder="Ej. Av. Perú 123, SMP" />
          </label>
          <p className="text-xs text-slate-500">Al cobrar, el asistente de esta PC la firma, la envía a SUNAT y la imprime.</p>
        </div>
      )}
    </div>
  )
}
