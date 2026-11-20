import { useEffect, useState, type FormEvent } from "react"
import { createCatalogBarcode, getCatalogBarcodes } from "../api"
import { playScanPit, ScannerButton } from "../components/Scanner"

export function BarcodesPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getCatalogBarcodes>> | null>(null)
  const [error, setError] = useState("")
  const [productId, setProductId] = useState("")
  const [code, setCode] = useState("")
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState("")

  async function reload() {
    const payload = await getCatalogBarcodes()
    setData(payload)
    if (!productId && payload.products[0]) setProductId(payload.products[0].id)
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  /** Código leído con la cámara: se escribe en el campo; si ya está vinculado, avisa a qué producto. */
  function onScan(scanned: string) {
    const value = scanned.trim()
    if (!value) return
    playScanPit()
    setCode(value)
    const existing = data?.codes.find((row) => row.code === value)
    setNotice(existing ? `Ese código ya está vinculado a ${existing.productName}.` : `Código leído: ${value}. Revisa el producto y pulsa Vincular.`)
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    setNotice("")
    try {
      await createCatalogBarcode(productId, code)
      const name = data?.products.find((product) => product.id === productId)?.name ?? "el producto"
      setCode("")
      await reload()
      setNotice(`Código vinculado a ${name}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">Códigos de barras</h1>
        <p className="mt-1 text-sm text-slate-500">Elige el producto y registra su código.</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">{notice}</p> : null}
      {data?.writable ? (
        <form onSubmit={onCreate} className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4">
          <select
            className="h-12 min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          >
            {data.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <div className="flex min-w-[14rem] flex-1 gap-2">
            <input
              required
              className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
              placeholder="Código (escribe, usa el lector o la cámara)"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <ScannerButton onCode={onScan} />
          </div>
          <button
            type="submit"
            disabled={pending || !productId}
            className="h-12 rounded-xl bg-[var(--pf-accent)] px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Vincular"}
          </button>
        </form>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Producto</th>
            </tr>
          </thead>
          <tbody>
            {(data?.codes ?? []).map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono">{row.code}</td>
                <td className="px-3 py-2">{row.productName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
