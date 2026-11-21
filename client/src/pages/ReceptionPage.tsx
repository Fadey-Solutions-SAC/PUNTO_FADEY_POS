import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { getPurchaseReception, postPurchaseReception } from "../api"

export function ReceptionPage() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<{ id: string; tradeName: string; paymentTerm?: string; creditDays?: number | null }[]>([])
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPurchaseReception>>["lines"]>([])
  const [supplierId, setSupplierId] = useState("")
  const [documentNumber, setDocumentNumber] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [key] = useState(() => crypto.randomUUID())
  // Recepción y pago
  const [receiveNow, setReceiveNow] = useState(true)
  const [payMode, setPayMode] = useState<"full" | "partial" | "credit">("full")
  const [payMethod, setPayMethod] = useState<"CASH" | "TRANSFER" | "OTHER">("TRANSFER")
  const [payAmount, setPayAmount] = useState("")
  const [lots, setLots] = useState<Record<string, { lotCode?: string; expiresAt?: string }>>({})

  useEffect(() => {
    getPurchaseReception()
      .then((data) => {
        setSuppliers(data.suppliers)
        setRows(data.lines)
        setSupplierId(data.suppliers[0]?.id ?? "")
        if (data.suppliers[0]?.paymentTerm === "CREDITO") setPayMode("credit")
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  const totalCents = rows.reduce((sum, row) => {
    const qty = Number(String(row.quantity).replace(",", ".")) || 0
    const cost = Number(String(row.unitCost).replace(",", ".")) || 0
    return sum + Math.round(qty * cost * 100)
  }, 0)

  async function onSubmit() {
    setPending(true)
    setError("")
    try {
      const payNow = payMode === "full" ? (totalCents / 100).toFixed(2) : payMode === "partial" ? payAmount : undefined
      const result = await postPurchaseReception({
        supplierId,
        documentNumber,
        idempotencyKey: key,
        receiveNow,
        payNow: payNow && Number(payNow) > 0 ? payNow : undefined,
        payMethod,
        lines: rows
          .filter((row) => Number(row.quantity) > 0)
          .map((row) => ({
            productId: row.productId,
            presentationId: row.presentationId,
            quantity: row.quantity,
            unitCost: row.unitCost || "0",
            // Precio de venta: se actualiza en el producto solo si cambió.
            salePrice: row.salePrice,
            lotCode: receiveNow ? lots[row.productId]?.lotCode : undefined,
            expiresAt: receiveNow ? lots[row.productId]?.expiresAt : undefined,
          })),
      })
      navigate(`/compras/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar")
    } finally {
      setPending(false)
    }
  }

  if (!error && rows.length === 0 && suppliers.length === 0) {
    return <p className="text-sm text-slate-500">Cargando recepción…</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-slate-500">Sale del requerimiento; anota cantidad comprada y costo.</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">
          Todavía no hay lista. Ármala en{" "}
          <Link to="/compras/requerimiento" className="text-[var(--pf-accent)] hover:underline">
            Requerimiento
          </Link>
          .
        </p>
      ) : suppliers.length === 0 ? (
        <p className="text-sm text-slate-600">
          Registra un proveedor en{" "}
          <Link to="/compras/proveedores" className="text-[var(--pf-accent)] hover:underline">
            Proveedores
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Proveedor
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={supplierId}
                onChange={(event) => {
                  setSupplierId(event.target.value)
                  const supplier = suppliers.find((item) => item.id === event.target.value)
                  setPayMode(supplier?.paymentTerm === "CREDITO" ? "credit" : "full")
                }}
              >
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.tradeName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Documento
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                placeholder="Factura o guía"
              />
            </label>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Presentación</th>
                  <th className="px-3 py-2 font-medium">Cantidad</th>
                  <th className="px-3 py-2 font-medium">Costo</th>
                  <th className="px-3 py-2 font-medium">Precio venta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.productId} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      {row.name}
                      <span className="block text-xs text-slate-500">{row.unit}</span>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded-xl border border-slate-200 px-2 py-1.5"
                        value={row.presentationId}
                        onChange={(event) => {
                          const next = row.presentations.find((item) => item.id === event.target.value)
                          setRows((current) =>
                            current.map((item) =>
                              item.productId === row.productId
                                ? {
                                    ...item,
                                    presentationId: event.target.value,
                                    unitCost: next?.unitCost ?? item.unitCost,
                                    salePrice: next?.salePrice ?? item.salePrice,
                                  }
                                : item,
                            ),
                          )
                        }}
                      >
                        {row.presentations.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-24 rounded-xl border border-slate-200 px-3 py-2"
                        value={row.quantity}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.productId === row.productId ? { ...item, quantity: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-28 rounded-xl border border-slate-200 px-3 py-2"
                        value={row.unitCost}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.productId === row.productId ? { ...item, unitCost: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        inputMode="decimal"
                        aria-label={`Precio de venta de ${row.name}`}
                        className="w-28 rounded-xl border border-teal-300 bg-teal-50/40 px-3 py-2 font-semibold text-teal-800"
                        value={row.salePrice ?? ""}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.productId === row.productId ? { ...item, salePrice: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {receiveNow && rows.some((row) => row.trackLots && Number(row.quantity) > 0) ? (
            <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Lote y vencimiento</p>
              <p className="text-xs text-amber-800">Estos productos controlan lotes. Si lo dejas vacío se crea un lote con la fecha y el documento.</p>
              {rows
                .filter((row) => row.trackLots && Number(row.quantity) > 0)
                .map((row) => (
                  <div key={row.productId} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:items-center">
                    <span className="truncate text-sm font-medium text-slate-700">{row.name}</span>
                    <input
                      placeholder="Lote"
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                      value={lots[row.productId]?.lotCode ?? ""}
                      onChange={(e) => setLots((current) => ({ ...current, [row.productId]: { ...current[row.productId], lotCode: e.target.value } }))}
                    />
                    <input
                      type="date"
                      aria-label="Vence"
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                      value={lots[row.productId]?.expiresAt ?? ""}
                      onChange={(e) => setLots((current) => ({ ...current, [row.productId]: { ...current[row.productId], expiresAt: e.target.value } }))}
                    />
                  </div>
                ))}
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[var(--pf-navy)]">¿La mercadería ya llegó?</p>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                {(
                  [
                    [true, "Sí, recibir ahora"],
                    [false, "No, queda pendiente"],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setReceiveNow(value)}
                    className={`h-9 rounded-lg text-xs font-semibold ${receiveNow === value ? "bg-white text-[var(--pf-navy)] shadow-sm" : "text-slate-500"}`}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {receiveNow ? "El stock y el costo de los productos se actualizan al registrar." : "No suma stock: la recibes después desde Por pagar o el historial."}
              </p>
            </div>
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold text-[var(--pf-navy)]">Pago al proveedor</p>
                <p className="text-sm">
                  Total <b className="tabular-nums text-[var(--pf-navy)]">S/ {(totalCents / 100).toFixed(2)}</b>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                {(
                  [
                    ["full", "Pagado"],
                    ["partial", "Adelanto"],
                    ["credit", "Por pagar"],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPayMode(value)}
                    className={`h-9 rounded-lg text-xs font-semibold ${payMode === value ? "bg-white text-[var(--pf-navy)] shadow-sm" : "text-slate-500"}`}
                  >
                    {text}
                  </button>
                ))}
              </div>
              {payMode !== "credit" ? (
                <div className="grid grid-cols-2 gap-2">
                  <select className="h-10 rounded-xl border border-slate-200 px-2 text-sm" value={payMethod} onChange={(e) => setPayMethod(e.target.value as "CASH" | "TRANSFER" | "OTHER")}>
                    <option value="TRANSFER">Transferencia</option>
                    <option value="CASH">Efectivo (sale de caja)</option>
                    <option value="OTHER">Otro</option>
                  </select>
                  {payMode === "partial" ? (
                    <input
                      inputMode="decimal"
                      placeholder="Monto"
                      className="h-10 rounded-xl border border-slate-200 px-3 text-right text-sm tabular-nums"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  ) : (
                    <span className="grid h-10 place-items-center rounded-xl bg-emerald-50 text-sm font-semibold text-emerald-700">Paga el total</span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Todo el monto queda en Cuentas por pagar.</p>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={pending || totalCents <= 0 || (payMode === "partial" && !(Number(payAmount) > 0))}
            onClick={onSubmit}
            className="h-11 rounded-xl bg-[var(--pf-accent)] px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Registrando…" : receiveNow ? "Registrar compra y recibir" : "Registrar compra pendiente"}
          </button>
        </>
      )}
    </div>
  )
}
