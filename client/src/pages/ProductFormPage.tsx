import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { getCatalogForm, getCatalogProduct, saveCatalogProduct } from "../api"
import { ProductPhoto } from "../components/ProductPhoto"
import { playScanPit, ScannerButton } from "../components/Scanner"

const TAX_OPTIONS = [
  { value: "GRAVADO", label: "Gravado con IGV", hint: "Lo normal: el precio incluye IGV." },
  { value: "EXONERADO", label: "Exonerado", hint: "Sin IGV por ley (p. ej. algunos alimentos en zonas exoneradas)." },
  { value: "INAFECTO", label: "Inafecto", hint: "No está afecto al IGV (p. ej. libros, ciertos servicios)." },
] as const

const input = "mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
      {hint ? <span className="mt-0.5 block text-xs font-normal text-slate-400">{hint}</span> : null}
    </label>
  )
}

export function ProductFormPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(productId)
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  const [units, setUnits] = useState<{ id: string; name: string; symbol: string }[]>([])
  const [form, setForm] = useState({
    name: "",
    internalCode: "",
    categoryId: "",
    brandName: "",
    baseUnitId: "",
    taxType: "GRAVADO",
    costPrice: "0",
    salePrice: "0",
    wholesalePrice: "0",
    retailPrice: "0",
    minStock: "0",
    maxStock: "",
    initialQuantity: "",
    barcode: "",
    trackLots: false,
    isActive: true,
  })
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [pending, setPending] = useState(false)
  const priceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (editing && productId) {
          const data = await getCatalogProduct(productId)
          if (cancelled) return
          setBrands(data.brands ?? [])
          setUnits(data.units)
          setImagePath(data.imagePath ?? null)
          setForm({
            name: data.values.name,
            internalCode: data.values.internalCode,
            categoryId: data.values.categoryId,
            brandName: data.values.brandName,
            baseUnitId: data.values.baseUnitId,
            taxType: data.values.taxType || "GRAVADO",
            costPrice: data.values.costPrice,
            salePrice: data.values.salePrice,
            wholesalePrice: data.values.wholesalePrice,
            retailPrice: data.values.retailPrice,
            minStock: data.values.minStock,
            maxStock: data.values.maxStock,
            initialQuantity: "",
            barcode: data.values.barcodes[0] ?? "",
            trackLots: data.values.trackLots,
            isActive: data.values.isActive,
          })
        } else {
          const data = await getCatalogForm()
          if (cancelled) return
          setBrands(data.brands ?? [])
          setUnits(data.units)
          setForm((current) => ({
            ...current,
            // Por defecto "Unidad" (lo normal en bodega); si no existe, la primera.
            baseUnitId: (data.units.find((unit) => unit.symbol.toLowerCase() === "und") ?? data.units[0])?.id ?? "",
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

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }))

  function onScan(code: string) {
    const value = code.trim()
    if (!value) return
    playScanPit()
    setForm((current) => ({ ...current, barcode: value }))
    setNotice(`Código leído: ${value}`)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await saveCatalogProduct({
        id: productId,
        name: form.name,
        // El código interno se genera solo al crear; al editar se conserva el que tenía.
        internalCode: editing ? form.internalCode : undefined,
        categoryId: form.categoryId || undefined,
        brandName: form.brandName,
        baseUnitId: form.baseUnitId,
        taxType: form.taxType,
        costPrice: form.costPrice,
        salePrice: form.salePrice,
        wholesalePrice: form.wholesalePrice,
        retailPrice: form.retailPrice,
        minStock: form.minStock,
        maxStock: form.maxStock || undefined,
        initialQuantity: editing ? undefined : form.initialQuantity || undefined,
        trackLots: form.trackLots,
        isActive: form.isActive,
        barcodes: form.barcode ? [form.barcode] : [],
        presentations: [],
      })
      navigate(`/productos`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setPending(false)
    }
  }

  const unitSymbol = units.find((unit) => unit.id === form.baseUnitId)?.symbol ?? ""

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-4">
          {editing && productId ? (
            <ProductPhoto
              name={form.name || "Producto"}
              imagePath={imagePath}
              productId={productId}
              size={72}
              editable
              onUploaded={setImagePath}
            />
          ) : null}
          <div>
            <p className="mt-1 text-sm text-slate-500">
              {editing ? "Toca la foto para cambiarla." : "Guarda el producto y luego agrega su foto."}
            </p>
          </div>
        </div>
        <Link to="/productos" className="text-sm text-[var(--pf-accent)] hover:underline">
          Volver a productos
        </Link>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">{notice}</p> : null}

      <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <Field label="Nombre" wide>
          <input required className={`${input} uppercase`} value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Ej. ARROZ COSTEÑO 750 G" />
        </Field>
        <Field label="Marca" hint="Elige una existente o escribe una nueva.">
          <input list="pf-brands" className={input} value={form.brandName} onChange={(e) => set("brandName")(e.target.value)} placeholder="Ej. Costeño" />
          <datalist id="pf-brands">
            {brands.map((brand) => (
              <option key={brand.id} value={brand.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Código de barras" hint="Escanea con la cámara o el lector, o escríbelo.">
          <span className="flex gap-2">
            <input
              className={`${input} min-w-0 font-mono`}
              value={form.barcode}
              onChange={(e) => set("barcode")(e.target.value)}
              onKeyDown={(event) => {
                // El lector USB termina con Enter: no guardar el formulario, pasar al precio.
                if (event.key === "Enter") {
                  event.preventDefault()
                  priceRef.current?.focus()
                }
              }}
              placeholder="Ej. 7751234567890"
            />
            <span className="mt-1">
              <ScannerButton onCode={onScan} />
            </span>
          </span>
        </Field>
        <Field label="Unidad base">
          <select required className={input} value={form.baseUnitId} onChange={(e) => set("baseUnitId")(e.target.value)}>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Impuesto" hint={TAX_OPTIONS.find((item) => item.value === form.taxType)?.hint}>
          <select className={input} value={form.taxType} onChange={(e) => set("taxType")(e.target.value)}>
            {TAX_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">Precios</p>
        <Field label="Costo" hint="Lo que te cuesta cada unidad.">
          <input inputMode="decimal" className={input} value={form.costPrice} onChange={(e) => set("costPrice")(e.target.value)} placeholder="Ej. 3.20" />
        </Field>
        <Field label="Precio de venta">
          <input ref={priceRef} inputMode="decimal" className={input} value={form.salePrice} onChange={(e) => set("salePrice")(e.target.value)} placeholder="Ej. 4.50" />
        </Field>
        <Field label="Precio mayorista">
          <input inputMode="decimal" className={input} value={form.wholesalePrice} onChange={(e) => set("wholesalePrice")(e.target.value)} placeholder="Ej. 4.00" />
        </Field>
        <Field label="Precio minorista">
          <input inputMode="decimal" className={input} value={form.retailPrice} onChange={(e) => set("retailPrice")(e.target.value)} placeholder="Ej. 4.30" />
        </Field>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">Stock</p>
        {!editing ? (
          <Field label={`Cantidad inicial${unitSymbol ? ` (${unitSymbol})` : ""}`} hint="Lo que hay ahora en el almacén. Entra al kardex como entrada.">
            <input inputMode="decimal" className={input} value={form.initialQuantity} onChange={(e) => set("initialQuantity")(e.target.value)} placeholder="Ej. 24" />
          </Field>
        ) : null}
        <Field label="Stock mínimo" hint="Avisa en Alertas de stock al bajar de aquí.">
          <input inputMode="decimal" className={input} value={form.minStock} onChange={(e) => set("minStock")(e.target.value)} placeholder="Ej. 5" />
        </Field>
        <Field label="Stock máximo" hint="Tope para el requerimiento de compra.">
          <input inputMode="decimal" className={input} value={form.maxStock} onChange={(e) => set("maxStock")(e.target.value)} placeholder="Ej. 50" />
        </Field>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="size-4" checked={form.isActive} onChange={(e) => setForm((current) => ({ ...current, isActive: e.target.checked }))} />
          Activo (se puede vender)
        </label>
        <button
          type="submit"
          disabled={pending || !form.baseUnitId}
          className="h-11 rounded-xl bg-[var(--pf-accent)] px-5 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:w-fit"
        >
          {pending ? "Guardando…" : "Guardar producto"}
        </button>
      </form>
    </div>
  )
}
