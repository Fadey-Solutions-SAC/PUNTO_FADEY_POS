/**
 * Información externa para PIX (todo se consulta desde el servidor, sin claves):
 * - Open Food Facts: datos de un producto por código de barras.
 * - Precios de referencia en supermercados peruanos (búsqueda pública de sus tiendas web: Plaza Vea, Wong y Metro).
 * - Calendario: feriados de Perú y fechas comerciales útiles para un minimarket (calculados aquí, sin internet).
 * Cada consulta tiene tiempo límite y caché; si una fuente no responde, se dice y el chat sigue.
 */
import { dayText, fold } from "@/lib/pix/text"

const CACHE = new Map<string, { at: number; value: unknown }>()
const TTL = 60 * 60 * 1000

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value as T
  const value = await load()
  CACHE.set(key, { at: Date.now(), value })
  if (CACHE.size > 300) CACHE.delete(CACHE.keys().next().value as string)
  return value
}

async function getJson(url: string, timeout = 8000): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "PuntoFadeyPOS/1.0 (asistente PIX)" },
    signal: AbortSignal.timeout(timeout),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/* ───────────── Open Food Facts ───────────── */

export type FoodFacts = { code: string; name: string; brand: string; quantity: string; categories: string; nutriscore: string; ingredients: string; image: string | null }

export async function openFoodFacts(code: string): Promise<FoodFacts | null> {
  return cached(`off:${code}`, async () => {
    const fields = "product_name,product_name_es,brands,quantity,categories,nutriscore_grade,ingredients_text_es,ingredients_text,image_front_small_url"
    const data = (await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`)) as {
      status?: number
      product?: Record<string, string | undefined>
    }
    if (data.status !== 1 || !data.product) return null
    const p = data.product
    return {
      code,
      name: p.product_name_es || p.product_name || "",
      brand: p.brands || "",
      quantity: p.quantity || "",
      categories: (p.categories || "").split(",").slice(-2).map((s) => s.trim()).join(", "),
      nutriscore: (p.nutriscore_grade || "").toUpperCase(),
      ingredients: (p.ingredients_text_es || p.ingredients_text || "").slice(0, 220),
      image: p.image_front_small_url || null,
    }
  })
}

export function foodFactsText(f: FoodFacts) {
  const lines = [`**${f.name || "Producto sin nombre"}**${f.brand ? ` · ${f.brand}` : ""}${f.quantity ? ` · ${f.quantity}` : ""}`, `Código: ${f.code}`]
  if (f.categories) lines.push(`Categoría: ${f.categories}`)
  if (f.nutriscore && /^[A-E]$/.test(f.nutriscore)) lines.push(`Nutri-Score: ${f.nutriscore}`)
  if (f.ingredients) lines.push(`Ingredientes: ${f.ingredients}${f.ingredients.length >= 220 ? "…" : ""}`)
  lines.push("_Fuente: Open Food Facts (base abierta y colaborativa; puede tener datos incompletos)._")
  return lines.join("\n")
}

/* ───────────── Supermercados (precios de referencia) ───────────── */

export type StorePrice = { store: string; name: string; price: number; listPrice: number; url: string }

const STORES = [
  { name: "Plaza Vea", host: "https://www.plazavea.com.pe" },
  { name: "Wong", host: "https://www.wong.pe" },
  { name: "Metro", host: "https://www.metro.pe" },
]

type VtexProduct = {
  productName?: string
  link?: string
  items?: { sellers?: { commertialOffer?: { Price?: number; ListPrice?: number; AvailableQuantity?: number } }[] }[]
}

async function searchStore(store: (typeof STORES)[number], query: string): Promise<StorePrice[]> {
  const url = `${store.host}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(query)}&_from=0&_to=4`
  const data = (await getJson(url, 7000)) as VtexProduct[]
  if (!Array.isArray(data)) return []
  const out: StorePrice[] = []
  for (const product of data) {
    const offer = product.items?.[0]?.sellers?.[0]?.commertialOffer
    if (!offer?.Price || !product.productName) continue
    out.push({ store: store.name, name: product.productName, price: offer.Price, listPrice: offer.ListPrice ?? offer.Price, url: product.link ?? store.host })
  }
  return out
}

/** «1 litro» → «1l», «5 kilos» → «5kg», «400 gr» → «400g», «900 ml» → «900ml» (para comparar tamaños). */
export function sizeNorm(text: string) {
  return fold(text)
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:litros?|lts?|l)\b/g, "$1l")
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:kilos?|kgs?)\b/g, "$1kg")
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:gramos?|grs?|g)\b/g, "$1g")
    .replace(/(\d+(?:[.,]\d+)?)\s*ml\b/g, "$1ml")
    .replace(/(\d+),(\d+)/g, "$1.$2")
}

const SIZE = /^\d+(?:\.\d+)?(?:l|kg|g|ml)$/

export async function supermarketPrices(query: string, only: string[] = []): Promise<{ results: StorePrice[]; failed: string[]; exact: boolean }> {
  const words = sizeNorm(query).split(" ").filter((w) => w.length > 1).slice(0, 7)
  const sizes = words.filter((w) => SIZE.test(w))
  const names = words.filter((w) => !SIZE.test(w))
  // La tienda busca por nombre; el tamaño se filtra aquí («1l» también acepta «1 L» o «1 litro»).
  const q = names.join(" ")
  const stores = only.length ? STORES.filter((store) => only.includes(store.name)) : STORES
  return cached(`vtex:${stores.map((x) => x.name).join(",")}:${words.join(" ")}`, async () => {
    const settled = await Promise.allSettled(stores.map((store) => searchStore(store, q)))
    const failed: string[] = []
    const all: StorePrice[][] = []
    settled.forEach((entry, i) => {
      if (entry.status === "rejected") failed.push(stores[i].name)
      all.push(entry.status === "fulfilled" ? entry.value : [])
    })
    const has = (row: StorePrice, terms: string[]) => {
      const name = ` ${sizeNorm(row.name)} `
      return terms.every((t) => (SIZE.test(t) ? name.includes(` ${t} `) : name.includes(t)))
    }
    const keyTerms = names.filter((w) => w.length > 2)
    const exactRows = all.map((rows) => rows.filter((row) => has(row, [...keyTerms, ...sizes])))
    const exact = exactRows.some((rows) => rows.length > 0)
    const picked = exact ? exactRows : all.map((rows) => rows.filter((row) => has(row, keyTerms)))
    // Primero los que empiezan por lo buscado («Aceite Primor…» antes que «Atún en aceite Primor»).
    const first = keyTerms[0] ?? ""
    const rank = (row: StorePrice) => {
      const at = sizeNorm(row.name).indexOf(first)
      return at < 0 ? 999 : at
    }
    const results = picked.flatMap((rows) => [...rows].sort((a, b) => rank(a) - rank(b)).slice(0, 3))
    return { results, failed, exact: sizes.length > 0 && exact && results.length > 0 }
  })
}

export function pricesText(query: string, data: { results: StorePrice[]; failed: string[]; exact: boolean }, ownPrice?: { name: string; price: number }) {
  if (!data.results.length) {
    return `No encontré «${query}» en las tiendas web consultadas${data.failed.length ? ` (sin respuesta de ${data.failed.join(", ")})` : ""}. Prueba con marca y tamaño, por ejemplo «precio de leche Gloria 400g».`
  }
  const lines = [`**Precios de referencia para «${query}»:**`]
  for (const row of data.results) {
    const promo = row.listPrice > row.price ? ` (antes S/ ${row.listPrice.toFixed(2)})` : ""
    lines.push(`- ${row.store}: ${row.name} — **S/ ${row.price.toFixed(2)}**${promo}`)
  }
  if (ownPrice && !data.exact) {
    lines.push("", `Tu precio de ${ownPrice.name}: **S/ ${(ownPrice.price / 100).toFixed(2)}**. Para comparar con el mercado, dime el tamaño exacto (por ejemplo «1 litro» o «400 g»).`)
  } else if (ownPrice) {
    const comparable = data.results.map((r) => r.price)
    const avg = comparable.reduce((a, b) => a + b, 0) / comparable.length
    const own = ownPrice.price / 100
    const diff = ((own - avg) / avg) * 100
    lines.push("", `Tu precio de ${ownPrice.name}: **S/ ${own.toFixed(2)}** — ${Math.abs(diff) < 1 ? "igual al promedio" : `${Math.abs(diff).toFixed(0)} % ${diff > 0 ? "más caro" : "más barato"} que el promedio`} de lo encontrado. Compara solo si es la misma presentación.`)
  }
  if (data.failed.length) lines.push(`(Sin respuesta de ${data.failed.join(", ")}.)`)
  lines.push(`_Precios publicados en las tiendas web hoy ${dayText(new Date())}; pueden variar por tienda y promoción._`)
  return lines.join("\n")
}

/* ───────────── Calendario: feriados y fechas comerciales ───────────── */

type Holiday = { date: Date; name: string; kind: "feriado" | "comercial" }

/** Domingo de Pascua (algoritmo de Meeus/Butcher). */
function easter(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function nthSunday(year: number, month: number, n: number) {
  const first = new Date(year, month, 1)
  const offset = (7 - first.getDay()) % 7
  return new Date(year, month, 1 + offset + (n - 1) * 7)
}

function calendar(year: number): Holiday[] {
  const e = easter(year)
  const d = (m: number, day: number) => new Date(year, m - 1, day)
  const shift = (base: Date, days: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
  return [
    { date: d(1, 1), name: "Año Nuevo", kind: "feriado" as const },
    { date: shift(e, -3), name: "Jueves Santo", kind: "feriado" as const },
    { date: shift(e, -2), name: "Viernes Santo", kind: "feriado" as const },
    { date: d(5, 1), name: "Día del Trabajo", kind: "feriado" as const },
    { date: d(6, 7), name: "Batalla de Arica y Día de la Bandera", kind: "feriado" as const },
    { date: d(6, 29), name: "San Pedro y San Pablo", kind: "feriado" as const },
    { date: d(7, 23), name: "Día de la Fuerza Aérea", kind: "feriado" as const },
    { date: d(7, 28), name: "Fiestas Patrias", kind: "feriado" as const },
    { date: d(7, 29), name: "Fiestas Patrias", kind: "feriado" as const },
    { date: d(8, 6), name: "Batalla de Junín", kind: "feriado" as const },
    { date: d(8, 30), name: "Santa Rosa de Lima", kind: "feriado" as const },
    { date: d(10, 8), name: "Combate de Angamos", kind: "feriado" as const },
    { date: d(11, 1), name: "Día de Todos los Santos", kind: "feriado" as const },
    { date: d(12, 8), name: "Inmaculada Concepción", kind: "feriado" as const },
    { date: d(12, 9), name: "Batalla de Ayacucho", kind: "feriado" as const },
    { date: d(12, 25), name: "Navidad", kind: "feriado" as const },
    { date: d(2, 14), name: "San Valentín (chocolates, golosinas, flores)", kind: "comercial" as const },
    { date: d(3, 1), name: "Inicio de la campaña escolar (útiles, loncheras)", kind: "comercial" as const },
    { date: nthSunday(year, 4, 2), name: "Día de la Madre (2.º domingo de mayo)", kind: "comercial" as const },
    { date: d(5, 15), name: "Depósito de CTS de mayo (más consumo)", kind: "comercial" as const },
    { date: nthSunday(year, 5, 3), name: "Día del Padre (3.er domingo de junio)", kind: "comercial" as const },
    { date: d(7, 15), name: "Gratificación de julio (más consumo por Fiestas Patrias)", kind: "comercial" as const },
    { date: d(10, 31), name: "Día de la Canción Criolla / Halloween (golosinas, bebidas)", kind: "comercial" as const },
    { date: d(11, 15), name: "Depósito de CTS de noviembre", kind: "comercial" as const },
    { date: d(12, 15), name: "Gratificación de diciembre (campaña navideña: panetón, chocolate, bebidas)", kind: "comercial" as const },
    { date: d(12, 31), name: "Fin de año (bebidas, descartables, uvas)", kind: "comercial" as const },
  ]
}

export function upcomingDates(days = 45, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
  return [...calendar(start.getFullYear()), ...calendar(start.getFullYear() + 1)]
    .filter((h) => h.date >= start && h.date <= end)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function calendarText(days = 45) {
  const list = upcomingDates(days)
  if (!list.length) return `No hay feriados ni fechas comerciales importantes en los próximos ${days} días.`
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const lines = [`**Fechas importantes de los próximos ${days} días:**`]
  for (const h of list) {
    const diff = Math.round((h.date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    const when = diff === 0 ? "hoy" : diff === 1 ? "mañana" : `en ${diff} días`
    lines.push(`- ${h.date.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })} (${when}): ${h.kind === "feriado" ? "🇵🇪 Feriado — " : "🛒 "}${h.name}`)
  }
  lines.push("", "Tip: abastécete de bebidas, snacks y descartables 3–5 días antes de feriados largos y de la gratificación.")
  lines.push("_Feriados nacionales según la ley vigente; el Gobierno puede declarar días no laborables adicionales._")
  return lines.join("\n")
}

/* ───────────── Wikipedia (español): qué es un producto o categoría ───────────── */

export type WikiSummary = { title: string; extract: string; url: string }

export async function wikipediaSummary(term: string): Promise<WikiSummary | null> {
  const q = term.trim()
  if (q.length < 3) return null
  return cached(`wiki:${fold(q)}`, async () => {
    const search = (await getJson(`https://es.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&namespace=0&format=json`, 6000)) as [string, string[], string[], string[]]
    const title = search?.[1]?.[0]
    if (!title) return null
    const page = (await getJson(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, 6000)) as { type?: string; extract?: string; content_urls?: { desktop?: { page?: string } } }
    if (!page?.extract || page.type === "disambiguation") return null
    // Las dos primeras oraciones bastan para el chat.
    const sentences = page.extract.split(/(?<=\.)\s+/).slice(0, 2).join(" ")
    return { title, extract: sentences.slice(0, 420), url: page.content_urls?.desktop?.page ?? `https://es.wikipedia.org/wiki/${encodeURIComponent(title)}` }
  })
}

/* ───────────── Open Food Facts por nombre (cuando no hay código de barras) ───────────── */

export async function foodFactsByName(query: string): Promise<FoodFacts | null> {
  const q = query.trim()
  if (q.length < 3) return null
  return cached(`offq:${fold(q)}`, async () => {
    const data = (await getJson(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=5&fields=code,product_name,brands,quantity,nutriscore_grade,categories_tags`, 7000)) as {
      hits?: { code?: string; product_name?: string; brands?: string[] | string; quantity?: string; nutriscore_grade?: string; categories_tags?: string[] }[]
    }
    const words = fold(q).split(" ").filter((w) => w.length > 2)
    // Solo un resultado que contenga todas las palabras buscadas (evita «galleta de arroz» al buscar «arroz»).
    const hit = (data.hits ?? []).find((h) => {
      const brand = Array.isArray(h.brands) ? h.brands.join(" ") : h.brands ?? ""
      const name = fold(`${h.product_name ?? ""} ${brand.replace(/^xx:/, "")}`)
      return h.product_name && words.every((w) => name.includes(w)) && fold(h.product_name).startsWith(words[0])
    })
    if (!hit?.code) return null
    const brand = (Array.isArray(hit.brands) ? hit.brands[0] : hit.brands ?? "").replace(/^\w\w:/, "")
    return {
      code: hit.code,
      name: hit.product_name ?? "",
      brand,
      quantity: hit.quantity ?? "",
      categories: (hit.categories_tags ?? []).slice(-2).map((c) => c.replace(/^\w\w:/, "").replace(/-/g, " ")).join(", "),
      nutriscore: /^[a-e]$/.test(hit.nutriscore_grade ?? "") ? hit.nutriscore_grade!.toUpperCase() : "",
      ingredients: "",
      image: null,
    }
  })
}
