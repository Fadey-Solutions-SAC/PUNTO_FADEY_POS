/**
 * Texto y fechas para el asistente PIX: normaliza la pregunta y entiende períodos
 * («hoy», «ayer», «esta semana», «mes pasado», «últimos 15 días», «10/11», «del 1/11 al 15/11», «octubre»…).
 * Las fechas se calculan en hora de Perú (el servidor corre con TZ=America/Lima).
 */

/** Como `fold` pero conserva puntos y comas de los números («5.80», «1,5»). Para órdenes con montos. */
export function foldKeepNumbers(text: string) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!"“”()]/g, " ")
    .replace(/(\d)[.,](\d)/g, "$1#$2")
    .replace(/[.,;:]/g, " ")
    .replace(/#/g, ".")
    .replace(/\s+/g, " ")
    .trim()
}

/** Minúsculas, sin tildes ni signos, espacios simples. */
export function fold(text: string) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:"“”()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export type Period = {
  from: Date
  to: Date
  label: string
  /** La pregunta nombró un período (si no, se usa el de por defecto). */
  explicit: boolean
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const DOWS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"]

function startOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(23, 59, 59, 999)
  return copy
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function dayText(date: Date) {
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function rangeLabel(from: Date, to: Date) {
  const a = dayText(from)
  const b = dayText(to)
  return a === b ? a : `${a} al ${b}`
}

function dateFromParts(day: number, month: number, year: number | undefined, now: Date) {
  let y = year ?? now.getFullYear()
  if (y < 100) y += 2000
  const date = new Date(y, month - 1, day)
  // «el 28/12» dicho en enero se refiere al año pasado.
  if (year == null && date > now) date.setFullYear(y - 1)
  return date
}

/**
 * Período pedido en la pregunta. `fallback` decide qué se usa si no se nombra ninguno.
 */
export function parsePeriod(message: string, fallback: "today" | "month" | "week" | "30d" = "today", now = new Date()): Period {
  const m = fold(message)
  const today = startOfDay(now)
  const make = (from: Date, to: Date, label: string): Period => ({ from: startOfDay(from), to: endOfDay(to), label, explicit: true })

  // Rango explícito: «del 1/11 al 15/11», «desde el 01/10/2026 hasta el 31/10/2026».
  const range = m.match(/(?:del|desde(?: el)?)\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\s+(?:al|hasta(?: el)?|a)\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/)
  if (range) {
    const from = dateFromParts(Number(range[1]), Number(range[2]), range[3] ? Number(range[3]) : undefined, now)
    const to = dateFromParts(Number(range[4]), Number(range[5]), range[6] ? Number(range[6]) : undefined, now)
    if (from <= to) return make(from, to, `del ${rangeLabel(from, to)}`)
  }

  const lastN = m.match(/\bultim[oa]s?\s+(\d{1,3})\s+(dias|semanas|meses)\b/)
  if (lastN) {
    const n = Math.max(1, Number(lastN[1]))
    const days = lastN[2] === "dias" ? n : lastN[2] === "semanas" ? n * 7 : n * 30
    const from = addDays(today, -(days - 1))
    return make(from, today, `de los últimos ${n} ${lastN[2] === "dias" ? "días" : lastN[2]}`)
  }

  if (/\bantier\b|\banteayer\b/.test(m)) {
    const d = addDays(today, -2)
    return make(d, d, `de anteayer (${dayText(d)})`)
  }
  if (/\bayer\b/.test(m)) {
    const d = addDays(today, -1)
    return make(d, d, `de ayer (${dayText(d)})`)
  }
  if (/\bhoy\b|\bdel dia\b|\beste dia\b/.test(m)) return make(today, today, `de hoy (${dayText(today)})`)

  if (/\bsemana pasada\b|\bsemana anterior\b/.test(m)) {
    const dow = (today.getDay() + 6) % 7 // lunes = 0
    const monday = addDays(today, -dow - 7)
    return make(monday, addDays(monday, 6), `de la semana pasada (${rangeLabel(monday, addDays(monday, 6))})`)
  }
  if (/\besta semana\b|\bla semana\b|\bsemanal\b/.test(m)) {
    const dow = (today.getDay() + 6) % 7
    const monday = addDays(today, -dow)
    return make(monday, today, `de esta semana (${rangeLabel(monday, today)})`)
  }
  if (/\bmes pasado\b|\bmes anterior\b/.test(m)) {
    const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const to = new Date(today.getFullYear(), today.getMonth(), 0)
    return make(from, to, `del mes pasado (${MONTHS[from.getMonth()]})`)
  }
  if (/\beste mes\b|\bel mes\b|\bdel mes\b|\bmensual\b/.test(m)) {
    const from = new Date(today.getFullYear(), today.getMonth(), 1)
    return make(from, today, `de este mes (${MONTHS[from.getMonth()]})`)
  }
  if (/\beste ano\b|\bel ano\b|\bdel ano\b|\banual\b/.test(m)) {
    const from = new Date(today.getFullYear(), 0, 1)
    return make(from, today, `de este año (${today.getFullYear()})`)
  }
  if (/\bano pasado\b/.test(m)) {
    const from = new Date(today.getFullYear() - 1, 0, 1)
    const to = new Date(today.getFullYear() - 1, 11, 31)
    return make(from, to, `del año pasado (${from.getFullYear()})`)
  }

  // Mes por nombre: «en octubre», «octubre 2025».
  const monthMatch = m.match(new RegExp(`\\b(${MONTHS.join("|")}|setiembre)\\b(?:\\s+(?:de(?:l)?\\s+)?(\\d{4}))?`))
  if (monthMatch && !/\b\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.test(m)) {
    const index = monthMatch[1] === "setiembre" ? 8 : MONTHS.indexOf(monthMatch[1])
    let year = monthMatch[2] ? Number(monthMatch[2]) : today.getFullYear()
    if (!monthMatch[2] && index > today.getMonth()) year -= 1
    const from = new Date(year, index, 1)
    const last = new Date(year, index + 1, 0)
    const to = last > today ? today : last
    return make(from, to, `de ${MONTHS[index]} ${year}`)
  }

  // Día concreto: «el 15 de octubre», «10/11», «10/11/2026».
  const named = m.match(new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join("|")}|setiembre)(?:\\s+(?:de(?:l)?\\s+)?(\\d{4}))?`))
  if (named) {
    const index = named[2] === "setiembre" ? 8 : MONTHS.indexOf(named[2])
    const d = dateFromParts(Number(named[1]), index + 1, named[3] ? Number(named[3]) : undefined, now)
    return make(d, d, `del ${dayText(d)}`)
  }
  const numeric = m.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
  if (numeric && Number(numeric[2]) >= 1 && Number(numeric[2]) <= 12) {
    const d = dateFromParts(Number(numeric[1]), Number(numeric[2]), numeric[3] ? Number(numeric[3]) : undefined, now)
    return make(d, d, `del ${dayText(d)}`)
  }

  // Día de la semana reciente: «el sábado», «el lunes pasado».
  const dow = m.match(/\b(?:el\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/)
  if (dow && !/\blos (domingo|lunes|martes|miercoles|jueves|viernes|sabado)s\b/.test(m)) {
    const target = DOWS.indexOf(dow[1])
    let diff = (today.getDay() - target + 7) % 7
    if (diff === 0 && /pasado/.test(m)) diff = 7
    const d = addDays(today, -diff)
    return make(d, d, `del ${dow[1]} ${dayText(d)}`)
  }

  const base: Period = (() => {
    if (fallback === "month") {
      const from = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from, to: endOfDay(today), label: `de este mes (${MONTHS[from.getMonth()]})`, explicit: false }
    }
    if (fallback === "week") {
      const from = addDays(today, -6)
      return { from, to: endOfDay(today), label: `de los últimos 7 días`, explicit: false }
    }
    if (fallback === "30d") {
      const from = addDays(today, -29)
      return { from, to: endOfDay(today), label: `de los últimos 30 días`, explicit: false }
    }
    return { from: today, to: endOfDay(today), label: `de hoy (${dayText(today)})`, explicit: false }
  })()
  return base
}

/** Período anterior de la misma duración (para comparar). */
export function previousPeriod(period: Period): Period {
  // Mes en curso o mes completo: mismos días del mes anterior («1 al 27 de octubre» contra «1 al 27 de noviembre»).
  if (period.from.getDate() === 1 && period.from.getMonth() === period.to.getMonth()) {
    const from = new Date(period.from.getFullYear(), period.from.getMonth() - 1, 1)
    const lastDay = new Date(period.from.getFullYear(), period.from.getMonth(), 0).getDate()
    const to = new Date(from.getFullYear(), from.getMonth(), Math.min(period.to.getDate(), lastDay))
    return { from: startOfDay(from), to: endOfDay(to), label: `los mismos días del mes anterior (${rangeLabel(from, to)})`, explicit: true }
  }
  if (period.from.toDateString() === period.to.toDateString()) {
    const week = addDays(period.from, -7)
    return { from: startOfDay(week), to: endOfDay(week), label: `el mismo día de la semana pasada (${dayText(week)})`, explicit: true }
  }
  const span = period.to.getTime() - period.from.getTime()
  const to = new Date(period.from.getTime() - 1)
  const from = new Date(to.getTime() - span)
  return { from: startOfDay(from), to: endOfDay(to), label: `el período anterior (${rangeLabel(from, to)})`, explicit: true }
}

/** Palabras útiles para buscar un producto dentro de la pregunta. */
const STOP = new Set(
  (
    "a al algo alguna alguno algun ante como con cual cuales cuanto cuanta cuantos cuantas cuesta cuestan de del donde el ella en es esta este esto hay la las le lo los me mi mis nos o para por que quien se si sin sobre su sus tengo tenemos tiene un una uno unos unas y ya " +
    "stock existencias queda quedan quedo inventario precio precios vale valen sale cuesta producto productos articulo item dame dime muestra muestrame ver saber quiero necesito busca buscar " +
    "almacen almacenes cada todos todas hoy ayer actual actualmente unidades unidad mas menos tienda tiendas supermercado supermercados referencia mercado plaza vea wong metro tottus " +
    "codigo barras barra info informacion datos ean pix favor porfa porfavor hola"
  ).split(" "),
)

export function searchTerms(message: string, extraStop: string[] = []) {
  const extra = new Set(extraStop.map(fold))
  return fold(message)
    .split(" ")
    .filter((word) => word.length >= 2 && !STOP.has(word) && !extra.has(word) && !/^\d{1,3}$/.test(word))
}

export function money(cents: number, currency = "PEN") {
  const symbol = currency === "USD" ? "US$" : "S/"
  const sign = cents < 0 ? "-" : ""
  return `${sign}${symbol} ${(Math.abs(cents) / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Cantidad guardada ×10 000 → texto con hasta 2 decimales. */
export function qtyText(value: number) {
  const n = value / 10_000
  return Number.isInteger(n) ? n.toLocaleString("es-PE") : n.toLocaleString("es-PE", { maximumFractionDigits: 2 })
}

export function pct(part: number, total: number) {
  if (!total) return "0 %"
  return `${((part / total) * 100).toFixed(1)} %`
}
