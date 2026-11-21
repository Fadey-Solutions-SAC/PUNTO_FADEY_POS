import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link, useParams } from "react-router-dom"
import { getPayables, getPurchaseDetail, payPurchaseNow, receivePurchaseNow, type PayableRow } from "../api"

type Detail = Awaited<ReturnType<typeof getPurchaseDetail>>

const STATUS_STYLE: Record<string, string> = {
  ORDERED: "bg-amber-50 text-amber-800",
  PARTIAL: "bg-amber-50 text-amber-800",
  RECEIVED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-500",
}

/** Detalle de una compra: productos, recepción, pagos y saldo. */
export function PurchaseDetailPage() {
  const { purchaseId = "" } = useParams()
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<"CASH" | "TRANSFER" | "OTHER">("TRANSFER")
  const [lots, setLots] = useState<Record<string, { lotCode?: string; expiresAt?: string }>>({})

  const load = useCallback(
    () =>
      getPurchaseDetail(purchaseId)
        .then((detail) => {
          setData(detail)
          setAmount(detail.debtAmount)
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error")),
    [purchaseId],
  )

  useEffect(() => {
    void load()
  }, [load])

  async function onReceive() {
    if (!window.confirm("¿Recibir la mercadería? El stock de todos los productos pendientes aumentará ahora.")) return
    setBusy(true)
    setError("")
    try {
      await receivePurchaseNow(purchaseId, lots)
      setMessage("Mercadería recibida: el stock y el costo de los productos se actualizaron.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo recibir")
    } finally {
      setBusy(false)
    }
  }

  async function onPay(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      await payPurchaseNow(purchaseId, amount, method)
      setMessage(method === "CASH" ? "Pago registrado. Salió de tu caja abierta." : "Pago registrado.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el pago")
    } finally {
      setBusy(false)
    }
  }

  if (!data) return error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : <p className="text-sm text-slate-500">Cargando compra…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/compras/por-pagar" className="text-sm text-[var(--pf-accent)] hover:underline">
            ← Cuentas por pagar
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--pf-navy)]">
            {data.supplierName} · {data.documentNumber}
          </h1>
          <p className="text-sm text-slate-500">
            {data.createdAtLabel} · {data.warehouseName} · registró {data.userName}
            {data.supplierTaxId ? ` · RUC ${data.supplierTaxId}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_STYLE[data.status] ?? "bg-slate-100 text-slate-600"}`}>{data.statusLabel}</span>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ {message}</p> : null}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total</p>
          <p className="text-xl font-bold tabular-nums text-[var(--pf-navy)]">{data.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-sm text-emerald-700">Pagado</p>
          <p className="text-xl font-bold tabular-nums text-emerald-700">{data.paid}</p>
        </div>
        <div className={`rounded-2xl border p-4 shadow-sm ${data.debtCents > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
          <p className={`text-sm ${data.debtCents > 0 ? "text-red-700" : "text-slate-500"}`}>Por pagar</p>
          <p className={`text-xl font-bold tabular-nums ${data.debtCents > 0 ? "text-red-700" : "text-slate-400"}`}>{data.debt}</p>
        </div>
      </div>

      {data.canReceive ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            <b>Pendiente de recepción.</b> El stock no cambia hasta que recibas la mercadería.
          </p>
          <button type="button" disabled={busy} onClick={() => void onReceive()} className="h-11 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
            Recibir mercadería
          </button>
          {data.lines.some((line) => line.trackLots && !line.fullyReceived) ? (
            <div className="w-full space-y-2 rounded-xl bg-white/70 p-3">
              <p className="text-xs font-semibold text-amber-900">Lote y vencimiento (productos con control de lotes). Si lo dejas vacío se crea un lote con la fecha y el documento.</p>
              {data.lines
                .filter((line) => line.trackLots && !line.fullyReceived)
                .map((line) => (
                  <div key={line.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:items-center">
                    <span className="truncate text-sm font-medium text-slate-700">{line.description}</span>
                    <input
                      placeholder="Lote"
                      className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
                      value={lots[line.id]?.lotCode ?? ""}
                      onChange={(e) => setLots((current) => ({ ...current, [line.id]: { ...current[line.id], lotCode: e.target.value } }))}
                    />
                    <input
                      type="date"
                      aria-label="Vence"
                      className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
                      value={lots[line.id]?.expiresAt ?? ""}
                      onChange={(e) => setLots((current) => ({ ...current, [line.id]: { ...current[line.id], expiresAt: e.target.value } }))}
                    />
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 font-semibold text-[var(--pf-navy)]">Productos</div>
        <div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Recibido</th>
                <th className="px-3 py-2 text-right">Costo unit.</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-3 py-2 font-medium text-[var(--pf-navy)]">{line.description}</td>
                  <td className="px-3 py-2 text-right">{line.quantityLabel}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${line.fullyReceived ? "text-emerald-700" : "text-amber-700"}`}>{line.receivedLabel}</td>
                  <td className="px-3 py-2 text-right">{line.unitCost}</td>
                  <td className="px-3 py-2 text-right font-semibold">{line.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50">
                <td className="px-3 py-2 font-bold" colSpan={4}>
                  Total {/[1-9]/.test(data.discount) ? `(descuento ${data.discount})` : ""}
                </td>
                <td className="px-3 py-2 text-right font-bold">{data.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-[var(--pf-navy)]">Pagos</h2>
          {data.payments.length === 0 ? (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Todavía no hay pagos.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {data.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-slate-600">
                    {payment.createdAtLabel} · {payment.methodLabel}
                  </span>
                  <span className="font-semibold tabular-nums text-emerald-700">{payment.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {data.canPay ? (
          <form onSubmit={onPay} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-[var(--pf-navy)]">Registrar pago</h2>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {(
                [
                  ["TRANSFER", "Transferencia"],
                  ["CASH", "Efectivo"],
                  ["OTHER", "Otro"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMethod(value)}
                  className={`h-9 rounded-lg text-xs font-semibold ${method === value ? "bg-white text-[var(--pf-navy)] shadow-sm" : "text-slate-500"}`}
                >
                  {text}
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Monto (máx. {data.debt})
              <input
                placeholder="Ej. 150.00"
                inputMode="decimal"
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-right tabular-nums"
                value={amount}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            {method === "CASH" ? <p className="text-xs text-amber-700">El efectivo sale de tu caja abierta como egreso.</p> : null}
            <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
              {busy ? "Registrando…" : "Registrar pago"}
            </button>
          </form>
        ) : (
          <div className="grid place-items-center rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            {data.status === "CANCELLED" ? "Compra anulada" : "✓ Compra pagada por completo"}
          </div>
        )}
      </div>
    </div>
  )
}

/** Cuentas por pagar: deuda por proveedor, compras con saldo y pendientes de recibir. */
export function PayablesPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getPayables>> | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    getPayables()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  const maxDebt = Math.max(...(data?.suppliers.map((row) => row.debtCents) ?? [1]), 1)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Lo que se debe a proveedores y las compras que aún no llegan.</p>
        </div>
        <Link to="/compras/recepcion" className="inline-flex h-10 items-center rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white shadow-sm">
          + Registrar compra
        </Link>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 p-4 text-white shadow-sm">
              <p className="text-sm text-white/80">Total por pagar</p>
              <p className="text-2xl font-bold tabular-nums">{data.totalDebt}</p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
              <p className="text-sm text-indigo-700">Compras con saldo</p>
              <p className="text-2xl font-bold text-indigo-700">{data.payables.length}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-sm text-amber-800">Pendientes de recibir</p>
              <p className="text-2xl font-bold text-amber-700">{data.pendingReception.length}</p>
            </div>
          </div>

          {data.suppliers.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-[var(--pf-navy)]">Deuda por proveedor</h2>
              <div className="mt-3 space-y-2.5">
                {data.suppliers.map((row) => (
                  <div key={row.id} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                    <span className="truncate font-medium text-slate-700">{row.name}</span>
                    <span className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-3 rounded-full bg-red-500" style={{ width: `${Math.max(4, (row.debtCents / maxDebt) * 100)}%` }} />
                    </span>
                    <span className="whitespace-nowrap text-right">
                      <b className="tabular-nums text-red-700">{row.debt}</b>
                      <span className="ml-1 text-xs text-slate-400">
                        {row.count} compra{row.count === 1 ? "" : "s"} · desde {row.oldestLabel.split(",")[0]}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <PurchaseTable title="Compras con saldo por pagar" rows={data.payables} empty="✓ No debes nada a proveedores." showAge />
          <PurchaseTable title="Pendientes de recibir" rows={data.pendingReception} empty="No hay compras esperando mercadería." />
        </>
      ) : !error ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : null}
    </div>
  )
}

function PurchaseTable({ title, rows, empty, showAge = false }: { title: string; rows: PayableRow[]; empty: string; showAge?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="font-semibold text-[var(--pf-navy)]">{title}</h2>
        <span className="text-xs text-slate-500">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {row.createdAtLabel.split(",")[0]}
                    {showAge && row.days > 0 ? <span className={`ml-1 text-xs ${row.days > 30 ? "font-semibold text-red-600" : "text-slate-400"}`}>({row.days} d)</span> : null}
                  </td>
                  <td className="px-3 py-2 font-medium text-[var(--pf-navy)]">{row.supplierName}</td>
                  <td className="px-3 py-2">{row.documentNumber}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[row.status] ?? "bg-slate-100"}`}>{row.statusLabel}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{row.total}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${row.debtCents > 0 ? "text-red-700" : "text-slate-400"}`}>{row.debt}</td>
                  <td className="px-3 py-2 text-right">
                    <Link to={`/compras/${row.id}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--pf-accent)] hover:bg-slate-100">
                      {row.debtCents > 0 ? "Pagar" : "Ver"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
