import { useEffect, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react"
import { Boxes, DollarSign, Layers, Package, Trash2 } from "lucide-react"
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
    taxType: "EXONERADO",
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
  // Presentaciones de venta (kilo, medio kilo, saco…): se conservan al guardar.
  const [presentations, setPresentations] = useState<PresentationRow[]>([])
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [pending, setPending] = useState(false)
  const priceRef = useRef<HTMLInputElement>(null)
  // Código de barras a mano: un botón pequeño despliega el campo.
  const [manualCode, setManualCode] = useState(false)

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
          setPresentations(
            (data.values.presentations ?? []).map((item) => ({
              id: item.id,
              name: item.name,
              factorToBase: item.factorToBase,
              unitId: item.unitId ?? "",
              price: item.price ?? "",
              barcode: item.barcode ?? "",
              isDefault: item.isDefault,
            })),
          )
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
        presentations: presentationsToSave(),
      })
      navigate(`/productos`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setPending(false)
    }
  }

  const baseUnit = units.find((unit) => unit.id === form.baseUnitId)
  const unitSymbol = baseUnit?.symbol ?? ""

  /** Lo que se envía: la principal se llama como la unidad base si vale 1 (p. ej. «Kilogramo»). */
  function presentationsToSave() {
    const rows = presentations.filter((item) => item.name.trim() && Number(String(item.factorToBase).replace(",", ".")) > 0)
    if (!rows.length) return []
    if (!rows.some((item) => item.isDefault)) rows[0] = { ...rows[0], isDefault: true }
    return rows.map((item) => {
      const factor = String(item.factorToBase).replace(",", ".")
      const renamed = item.isDefault && Number(factor) === 1 && units.some((unit) => unit.name === item.name) && baseUnit ? baseUnit.name : item.name.trim()
      return { ...item, name: renamed, factorToBase: factor, price: String(item.price ?? "").replace(",", ".") || undefined, unitId: item.unitId || undefined }
    })
  }

  function updatePresentation(index: number, patch: Partial<PresentationRow>) {
    setPresentations((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function addPresentation(name = "", factor = "") {
    setPresentations((current) => {
      const base = current.length
        ? current
        : [{ name: baseUnit?.name ?? "Unidad", factorToBase: "1", unitId: "", price: "", barcode: "", isDefault: true }]
      return [...base, { name, factorToBase: factor, unitId: "", price: "", barcode: "", isDefault: false }]
    })
  }

  const weightUnit = ["kg", "g", "l", "ml"].includes(unitSymbol.toLowerCase())
  const suggestions =
    unitSymbol.toLowerCase() === "kg"
      ? [
          { name: "Medio kilo", factor: "0.5" },
          { name: "Cuarto de kilo", factor: "0.25" },
          { name: "Saco 50 kg", factor: "50" },
        ]
      : unitSymbol.toLowerCase() === "und"
        ? [
            { name: "Paquete x 6", factor: "6" },
            { name: "Caja x 12", factor: "12" },
          ]
        : []
  const num = (value: string) => Number(String(value).replace(",", ".")) || 0
  const cost = num(form.costPrice)
  const sale = num(form.salePrice)
  const profit = sale - cost
  const margin = sale > 0 ? (profit / sale) * 100 : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          {editing && productId ? (
            <ProductPhoto name={form.name || "Producto"} imagePath={imagePath} productId={productId} size={72} editable onUploaded={setImagePath} />
          ) : null}
          <p className="text-sm text-slate-500">{editing ? "Toca la foto para cambiarla." : "Guarda el producto y luego agrega su foto."}</p>
        </div>
        <Link to="/productos" className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[var(--pf-navy)] shadow-sm hover:bg-slate-50">
          ← Volver a productos
        </Link>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">{notice}</p> : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* 1. Datos del producto */}
        <Section color="#0d9488" icon={<Package size={18} />} title="Datos del producto" subtitle="Nombre, marca, unidad y código para venderlo.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Nombre" wide>
              <input
                required
                className={`${input} font-semibold uppercase`}
                value={form.name}
                onChange={(e) => set("name")(e.target.value.toLocaleUpperCase("es-PE"))}
                placeholder="Ej. ARROZ COSTEÑO 750 G"
              />
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
            <div className="text-sm font-medium text-slate-700">
              Estado
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                onClick={() => setForm((current) => ({ ...current, isActive: !current.isActive }))}
                className={`mt-1 flex h-11 w-full items-center justify-between rounded-xl border px-3 text-sm font-semibold transition ${
                  form.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {form.isActive ? "Activo · se puede vender" : "Inactivo · no se vende"}
                <span className={`relative h-5 w-9 rounded-full ${form.isActive ? "bg-emerald-500" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${form.isActive ? "left-[1.1rem]" : "left-0.5"}`} />
                </span>
              </button>
            </div>
            <Field label="Marca" hint="Elige una existente o escribe una nueva.">
              <BrandPicker brands={brands} value={form.brandName} onChange={(value) => set("brandName")(value.toLocaleUpperCase("es-PE"))} className={input} />
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
            <div className="text-sm font-medium text-slate-700 sm:col-span-2">
              Código de barras
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <ScannerButton onCode={onScan} />
                <button
                  type="button"
                  onClick={() => setManualCode((value) => !value)}
                  aria-expanded={manualCode}
                  className={`inline-flex h-12 shrink-0 items-center gap-1 rounded-xl border px-3 text-xs font-semibold shadow-sm ${
                    manualCode ? "border-slate-400 bg-slate-100 text-slate-700" : "border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                  }`}
                  title="Escribir el código a mano"
                >
                  ✎ A mano
                </button>
                {form.barcode && !manualCode ? (
                  <span className="inline-flex h-12 min-w-0 items-center gap-2 rounded-xl bg-teal-50 px-3 font-mono text-sm text-teal-800 ring-1 ring-teal-200">
                    <span className="truncate">{form.barcode}</span>
                    <button type="button" aria-label="Quitar código" className="text-teal-500 hover:text-red-600" onClick={() => set("barcode")("")}>
                      ✕
                    </button>
                  </span>
                ) : null}
              </span>
              {manualCode ? (
                <input
                  autoFocus
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-sm"
                  value={form.barcode}
                  onChange={(e) => set("barcode")(e.target.value)}
                  onKeyDown={(event) => {
                    // El lector USB termina con Enter: no guardar el formulario, pasar al precio.
                    if (event.key === "Enter") {
                      event.preventDefault()
                      setManualCode(false)
                      priceRef.current?.focus()
                    }
                  }}
                  placeholder="Ej. 7751234567890"
                />
              ) : (
                <span className="mt-0.5 block text-xs font-normal text-slate-400">
                  {form.barcode ? "Código cargado." : "Escanea con la cámara o el lector, o tócalo «A mano» para escribirlo."}
                </span>
              )}
            </div>
          </div>
        </Section>

        {/* 2. Precios */}
        <Section color="#7c3aed" icon={<DollarSign size={18} />} title="Precios" subtitle={`Por ${unitSymbol || "unidad"}. El precio de venta es el que se cobra en Caja.`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PriceField color="#e11d48" label="Costo" hint="Lo que te cuesta." value={form.costPrice} onChange={set("costPrice")} placeholder="Ej. 3.20" />
            <PriceField color="#059669" label="Precio de venta" hint="Precio normal en Caja." value={form.salePrice} onChange={set("salePrice")} placeholder="Ej. 4.50" inputRef={priceRef} strong />
            <PriceField color="#4f46e5" label="Precio mayorista" hint="Para compras por mayor." value={form.wholesalePrice} onChange={set("wholesalePrice")} placeholder="Ej. 4.00" />
            <PriceField color="#0284c7" label="Precio minorista" hint="Precio alternativo." value={form.retailPrice} onChange={set("retailPrice")} placeholder="Ej. 4.30" />
          </div>
          <div
            className={`mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl px-3 py-2 text-sm ${
              sale <= 0 ? "bg-slate-50 text-slate-500" : profit >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
            }`}
          >
            <span>
              Ganancia por {unitSymbol || "unidad"}: <b>S/ {profit.toFixed(2)}</b>
            </span>
            <span>
              Margen: <b>{margin.toFixed(1)} %</b>
            </span>
            {sale > 0 && profit < 0 ? <span className="font-semibold">⚠ Vendes por debajo del costo</span> : null}
          </div>
        </Section>

        {/* 3. Stock */}
        <Section color="#d97706" icon={<Boxes size={18} />} title="Stock" subtitle="Cantidad en el almacén y alertas de reposición.">
          {/* Las opciones de stock en una sola fila. */}
          <div className={`grid gap-3 ${editing ? "grid-cols-2" : "grid-cols-3"}`}>
            {!editing ? (
              <Field label={`Cantidad inicial${unitSymbol ? ` (${unitSymbol})` : ""}`} hint="Lo que hay ahora. Entra al kardex como entrada.">
                <input inputMode="decimal" className={input} value={form.initialQuantity} onChange={(e) => set("initialQuantity")(e.target.value)} placeholder="Ej. 24" />
              </Field>
            ) : null}
            <Field label="Stock mínimo" hint="Avisa en Alertas de stock al bajar de aquí.">
              <input inputMode="decimal" className={input} value={form.minStock} onChange={(e) => set("minStock")(e.target.value)} placeholder="Ej. 5" />
            </Field>
            <Field label="Stock máximo" hint="Tope para el requerimiento de compra.">
              <input inputMode="decimal" className={input} value={form.maxStock} onChange={(e) => set("maxStock")(e.target.value)} placeholder="Ej. 50" />
            </Field>
          </div>
        </Section>

        {/* 4. Presentaciones de venta */}
        <Section
          color="#0284c7"
          icon={<Layers size={18} />}
          title="Presentaciones de venta"
          subtitle={`Formas de vender el mismo producto; todas descuentan del stock en ${unitSymbol || "la unidad base"}.${weightUnit ? " En Caja también se puede vender por peso o por monto." : ""}`}
        >
          {presentations.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="border border-slate-200 px-2 py-1.5 font-semibold">Nombre</th>
                    <th className="border border-slate-200 px-2 py-1.5 font-semibold">Cantidad ({unitSymbol || "base"})</th>
                    <th className="border border-slate-200 px-2 py-1.5 font-semibold">Precio (S/)</th>
                    <th className="w-10 border border-slate-200" />
                  </tr>
                </thead>
                <tbody>
                  {presentations.map((item, index) => {
                    const factor = Number(String(item.factorToBase).replace(",", ".")) || 0
                    const auto = (sale * factor).toFixed(2)
                    return (
                      <tr key={item.id ?? `nuevo-${index}`}>
                        <td className="border border-slate-200 p-1">
                          <input
                            className="h-9 w-full rounded-lg px-2 font-semibold"
                            value={item.name}
                            onChange={(e) => updatePresentation(index, { name: e.target.value })}
                            placeholder="Ej. Medio kilo"
                          />
                          {item.isDefault ? <span className="px-2 text-[11px] text-slate-400">Principal (la que sale primero en Caja)</span> : null}
                        </td>
                        <td className="border border-slate-200 p-1">
                          <input
                            inputMode="decimal"
                            className="h-9 w-full rounded-lg px-2 text-right tabular-nums"
                            value={item.factorToBase}
                            onChange={(e) => updatePresentation(index, { factorToBase: e.target.value })}
                            placeholder="Ej. 0.5"
                          />
                        </td>
                        <td className="border border-slate-200 p-1">
                          <input
                            inputMode="decimal"
                            className="h-9 w-full rounded-lg px-2 text-right tabular-nums"
                            value={item.price}
                            onChange={(e) => updatePresentation(index, { price: e.target.value })}
                            placeholder={`Auto: ${auto}`}
                          />
                        </td>
                        <td className="border border-slate-200 p-1 text-center">
                          {!item.isDefault ? (
                            <button
                              type="button"
                              aria-label={`Quitar ${item.name || "presentación"}`}
                              className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => setPresentations((current) => current.filter((_, i) => i !== index))}
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-slate-400">Precio vacío = precio de venta × cantidad. Escribe un precio para darle uno especial (p. ej. el saco más barato).</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Se vende solo por {baseUnit?.name?.toLowerCase() || "unidad"}. Agrega presentaciones si lo vendes también en otros formatos.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions
              .filter((item) => !presentations.some((row) => row.name.trim().toLowerCase() === item.name.toLowerCase()))
              .map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => addPresentation(item.name, item.factor)}
                  className="inline-flex h-9 items-center rounded-xl bg-sky-50 px-3 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100"
                >
                  + {item.name}
                </button>
              ))}
            <button
              type="button"
              onClick={() => addPresentation()}
              className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              + Otra presentación
            </button>
          </div>
        </Section>

        </div>

        <div className="sticky bottom-2 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <Link to="/productos" className="inline-flex h-12 items-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={pending || !form.baseUnitId}
            className="h-12 rounded-xl bg-[var(--pf-accent)] px-8 text-base font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Guardando…" : editing ? "Guardar cambios" : "Guardar producto"}
          </button>
        </div>
      </form>
    </div>
  )
}

type PresentationRow = { id?: string; name: string; factorToBase: string; unitId: string; price: string; barcode: string; isDefault: boolean }

function Section({ color, icon, title, subtitle, children }: { color: string; icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="border-l-4" style={{ borderLeftColor: color }}>
      <header className="flex items-center gap-3 px-4 pt-4">
        <span className="grid size-8 place-items-center rounded-lg text-white shadow-sm" style={{ background: color }}>
          {icon}
        </span>
        <span>
          <span className="block font-semibold" style={{ color }}>
            {title}
          </span>
          <span className="block text-xs text-slate-500">{subtitle}</span>
        </span>
      </header>
      <div className="px-4 pb-4 pt-3">{children}</div>
    </section>
  )
}

function PriceField({
  color,
  label,
  hint,
  value,
  onChange,
  placeholder,
  inputRef,
  strong = false,
}: {
  color: string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  inputRef?: Ref<HTMLInputElement>
  strong?: boolean
}) {
  return (
    <label className="block rounded-xl border p-3 text-sm" style={{ borderColor: `${color}40`, background: `${color}0d` }}>
      <span className="flex items-center gap-2 font-semibold" style={{ color }}>
        <span className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="mt-1.5 flex items-center rounded-lg border bg-white px-3" style={{ borderColor: `${color}55` }}>
        <span className="text-sm text-slate-400">S/</span>
        <input
          ref={inputRef}
          inputMode="decimal"
          className={`h-11 w-full min-w-0 bg-transparent pl-2 text-right tabular-nums outline-none ${strong ? "text-lg font-bold" : "font-semibold"}`}
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </span>
      <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>
    </label>
  )
}

/** Marca: escribe para filtrar; la lista se despliega siempre hacia abajo, debajo del campo. */
function BrandPicker({
  brands,
  value,
  onChange,
  className,
}: {
  brands: { id: string; name: string }[]
  value: string
  onChange: (value: string) => void
  className: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const term = value.trim().toLowerCase()
  const matches = brands.filter((brand) => !term || brand.name.toLowerCase().includes(term))
  const exact = brands.some((brand) => brand.name.toLowerCase() === term)

  function pick(name: string) {
    onChange(name)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        className={`${className} pr-9`}
        value={value}
        placeholder="Ej. Costeño"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          onChange(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (!open || matches.length === 0) return
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setActive((index) => Math.min(index + 1, matches.length - 1))
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            setActive((index) => Math.max(index - 1, 0))
          } else if (event.key === "Enter") {
            event.preventDefault()
            pick(matches[active]?.name ?? value)
          } else if (event.key === "Escape") {
            setOpen(false)
          }
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Ver marcas"
        onMouseDown={(event) => {
          event.preventDefault()
          setOpen((current) => !current)
        }}
        className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 px-1 text-xs text-slate-500"
      >
        ▼
      </button>
      {open && (matches.length > 0 || (term && !exact)) ? (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((brand, index) => (
            <li key={brand.id}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  pick(brand.name)
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${index === active ? "bg-teal-50 text-teal-800" : "text-slate-700 hover:bg-slate-50"}`}
              >
                {brand.name}
              </button>
            </li>
          ))}
          {term && !exact ? (
            <li className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
              Se creará la marca nueva «{value.trim()}» al guardar.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
