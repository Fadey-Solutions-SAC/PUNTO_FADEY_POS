import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { createCatalogCategory, getCatalogForm, getCatalogProduct, saveCatalogProduct } from "../api"
import { ProductPhoto } from "../components/ProductPhoto"

export function ProductFormPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(productId)
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [units, setUnits] = useState<{ id: string; name: string; symbol: string }[]>([])
  const [form, setForm] = useState({
    name: "",
    internalCode: "",
    categoryId: "",
    brandName: "",
    baseUnitId: "",
    costPrice: "0",
    salePrice: "0",
    wholesalePrice: "0",
    retailPrice: "0",
    minStock: "0",
    barcode: "",
    trackLots: false,
    isActive: true,
  })
  const [categoryName, setCategoryName] = useState("")
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (editing && productId) {
          const data = await getCatalogProduct(productId)
          if (cancelled) return
          setCategories(data.categories)
          setUnits(data.units)
          setImagePath(data.imagePath ?? null)
          setForm({
            name: data.values.name,
            internalCode: data.values.internalCode,
            categoryId: data.values.categoryId,
            brandName: data.values.brandName,
            baseUnitId: data.values.baseUnitId,
            costPrice: data.values.costPrice,
            salePrice: data.values.salePrice,
            wholesalePrice: data.values.wholesalePrice,
            retailPrice: data.values.retailPrice,
            minStock: data.values.minStock,
            barcode: data.values.barcodes[0] ?? "",
            trackLots: data.values.trackLots,
            isActive: data.values.isActive,
          })
        } else {
          const data = await getCatalogForm()
          if (cancelled) return
          setCategories(data.categories)
          setUnits(data.units)
          setForm((current) => ({
            ...current,
            baseUnitId: data.units[0]?.id ?? "",
            categoryId: data.categories[0]?.id ?? "",
          }))
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editing, productId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      const result = await saveCatalogProduct({
        id: productId,
        ...form,
        barcodes: form.barcode ? [form.barcode] : [],
        presentations: [],
      })
      navigate(`/productos`)
      void result
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setPending(false)
    }
  }

  async function onAddCategory(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await createCatalogCategory(categoryName)
      const data = await getCatalogForm()
      setCategories(data.categories)
      const created = data.categories.find((item) => item.name === categoryName.trim().toLocaleUpperCase("es-PE"))
      if (created) setForm((current) => ({ ...current, categoryId: created.id }))
      setCategoryName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear categoría")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-4">
          {editing && productId ? (
            <ProductPhoto
              name={form.name || "Producto"}
              imagePath={imagePath}
              productId={productId}
              categoryId={form.categoryId}
              size={72}
              editable
              onUploaded={setImagePath}
            />
          ) : null}
          <div>
            <h1 className="text-2xl font-semibold text-[var(--pf-navy)]">
              {editing ? "Editar producto" : "Nuevo producto"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {editing ? "Toca el círculo para cambiar la foto. " : "Guarda el producto y luego agrega su foto. "}
              El stock entra por inventario.
            </p>
          </div>
        </div>
        <Link to="/productos" className="text-sm text-[var(--pf-accent)] hover:underline">
          Volver al catálogo
        </Link>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <form onSubmit={onAddCategory} className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <input
          className="min-w-[10rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm uppercase"
          placeholder="Nueva categoría"
          value={categoryName}
          onChange={(event) => setCategoryName(event.target.value)}
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium disabled:opacity-60"
        >
          Agregar categoría
        </button>
      </form>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          Nombre
          <input
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 uppercase"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label className="block text-sm">
          Código interno
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.internalCode}
            onChange={(event) => setForm((current) => ({ ...current, internalCode: event.target.value }))}
            placeholder="Auto"
          />
        </label>
        <label className="block text-sm">
          Código de barras
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.barcode}
            onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))}
          />
        </label>
        <label className="block text-sm">
          Categoría
          <select
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.categoryId}
            onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
          >
            <option value="">Sin categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Marca
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.brandName}
            onChange={(event) => setForm((current) => ({ ...current, brandName: event.target.value }))}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Unidad base
          <select
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.baseUnitId}
            onChange={(event) => setForm((current) => ({ ...current, baseUnitId: event.target.value }))}
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["costPrice", "Costo"],
            ["salePrice", "Precio venta"],
            ["wholesalePrice", "Mayorista"],
            ["retailPrice", "Minorista"],
            ["minStock", "Stock mínimo"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            {label}
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form[key]}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.trackLots}
            onChange={(event) => setForm((current) => ({ ...current, trackLots: event.target.checked }))}
          />
          Controlar lotes / vencimiento
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
          />
          Activo
        </label>
        <button
          type="submit"
          disabled={pending || !form.baseUnitId}
          className="h-10 rounded-xl bg-[var(--pf-accent)] px-4 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:w-fit"
        >
          {pending ? "Guardando…" : "Guardar producto"}
        </button>
      </form>
    </div>
  )
}
