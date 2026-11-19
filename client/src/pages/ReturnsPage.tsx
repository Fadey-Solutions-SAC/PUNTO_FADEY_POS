import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { getSaleReturn, submitSaleReturn } from "../api"

export function ReturnsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const initial = params.get("venta") ?? ""
  const [saleId, setSaleId] = useState(initial)
  const [sale, setSale] = useState<Awaited<ReturnType<typeof getSaleReturn>> | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [method, setMethod] = useState<"CASH" | "CREDIT">("CASH")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function loadSale(id: string) {
    setError("")
    setSale(null)
    setPending(true)
    try {
      const data = await getSaleReturn(id.trim())
      setSale(data)
      setMethod(data.credit ? "CREDIT" : "CASH")
      setQuantities({})
      setParams(data.saleId ? { venta: data.saleId } : {})
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se encontró la venta")
    } finally {
      setPending(false)
    }
  }

  useEffect(() => {
    if (initial) void loadSale(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar con ?venta=
  }, [])

  async function onSearch(event: FormEvent) {
    event.preventDefault()
    await loadSale(saleId)
  }

  async function onSubmit() {
    if (!sale) return
    setPending(true)
    setError("")
    try {
      const lines = Object.entries(quantities)
        .filter(([, quantity]) => quantity && quantity !== "0")
        .map(([saleLineId, quantity]) => ({ saleLineId, quantity }))
      await submitSaleReturn(sale.saleId, method, lines)
      navigate("/ventas/historial")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Devoluciones</h1>
        <p className="mt-1 text-sm text-slate-500">
          Reingresa stock y, si es efectivo, sale de la caja abierta.
        </p>
      </div>

      <form onSubmit={onSearch} className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="Identificador de la venta"
          value={saleId}
          onChange={(event) => setSaleId(event.target.value)}
        />
        <button
          type="submit"
          disabled={pending || !saleId.trim()}
          className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          Buscar
        </button>
      </form>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {sale ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">
            Venta {sale.code} · {sale.customerName}
            {sale.credit ? " · crédito" : ""}
          </p>
          {sale.lines.length === 0 ? (
            <p className="text-sm text-slate-600">No queda cantidad por devolver en esta venta.</p>
          ) : (
            <>
              {sale.lines.map((line) => (
                <label key={line.id} className="block text-sm">
                  {line.description} · pendiente {line.remainingLabel}
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    placeholder="0"
                    value={quantities[line.id] ?? ""}
                    onChange={(event) =>
                      setQuantities((current) => ({ ...current, [line.id]: event.target.value }))
                    }
                  />
                </label>
              ))}
              <label className="block text-sm">
                Método de reembolso
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={method}
                  onChange={(event) => setMethod(event.target.value as "CASH" | "CREDIT")}
                >
                  <option value="CASH">Devolver efectivo</option>
                  {sale.credit ? <option value="CREDIT">Descontar del crédito</option> : null}
                </select>
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={onSubmit}
                className="h-10 rounded-xl bg-[var(--pf-navy)] px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Registrando…" : "Registrar devolución"}
              </button>
            </>
          )}
          <Link to={`/ventas/${sale.saleId}`} className="inline-block text-sm text-[var(--pf-accent)] hover:underline">
            Ver detalle de la venta
          </Link>
        </div>
      ) : null}
    </div>
  )
}
