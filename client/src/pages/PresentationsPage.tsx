import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { getCatalogPresentations } from "../api"
import { ProductPhoto } from "../components/ProductPhoto"

export function PresentationsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getCatalogPresentations>>["rows"]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    getCatalogPresentations()
      .then((data) => setRows(data.rows))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error"))
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-slate-500">
          Cada presentación convierte a la unidad base del producto. Toca el círculo para cargar la foto del producto.
        </p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 font-medium">Presentación</th>
              <th className="px-3 py-2 font-medium">Factor</th>
              <th className="px-3 py-2 font-medium">Unidad</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-3">
                    <ProductPhoto
                      name={row.productName}
                      imagePath={row.imagePath}
                      productId={row.productId}
                      size={44}
                      editable
                      onUploaded={(imagePath) =>
                        setRows((current) =>
                          current.map((item) => (item.productId === row.productId ? { ...item, imagePath } : item)),
                        )
                      }
                    />
                    <span className="font-medium text-[var(--pf-navy)]">{row.productName}</span>
                  </span>
                </td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.factorLabel}</td>
                <td className="px-3 py-2">{row.unitSymbol}</td>
                <td className="px-3 py-2 text-right">
                  <Link to={`/productos/${row.productId}`} className="text-[var(--pf-accent)] hover:underline">
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !error ? <p className="px-3 py-6 text-center text-sm text-slate-500">Sin presentaciones.</p> : null}
      </div>
    </div>
  )
}
