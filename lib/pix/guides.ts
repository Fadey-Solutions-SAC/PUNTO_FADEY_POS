/**
 * Guías de PIX: «para qué sirve» y «cómo se usa» cada módulo de Punto Fadey.
 * El mapa es `lib/nav.ts`: cada guía apunta a una ruta del menú y hereda su permiso,
 * así PIX solo explica lo que el usuario puede abrir.
 */
import { can, type Permission } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"
import { fold } from "@/lib/pix/text"

export type Guide = {
  id: string
  title: string
  /** Ruta del menú (para el botón «Abrir»). */
  href: string
  permission?: Permission
  anyOf?: Permission[]
  keywords: string[]
  purpose: string[]
  steps: string[]
  tips?: string[]
}

export const GUIDES: Guide[] = [
  {
    id: "panel",
    title: "Panel principal",
    href: "/",
    keywords: ["panel", "panel principal", "inicio", "escritorio", "dashboard", "resumen del dia"],
    purpose: [
      "Ver de un vistazo cómo va el día: ventas de hoy contra ayer, ganancia estimada, ingresos y egresos de caja.",
      "Medios de pago del día, ventas de los últimos 7 días, cajas abiertas y productos que necesitan atención (agotados o bajo mínimo).",
      "Últimas ventas y últimas compras.",
    ],
    steps: ["Entra desde «Panel principal» en el menú; se actualiza solo con las operaciones del día.", "Toca un indicador para ir al módulo con el detalle."],
  },
  {
    id: "caja",
    title: "Caja (venta)",
    href: "/ventas",
    anyOf: ["sell", "cash"],
    keywords: ["caja", "vender", "venta", "cobrar", "punto de venta", "pos", "carrito", "ticket", "boleta", "nota de venta", "cuentas pendientes", "poner a cuenta", "fiado", "abrir caja", "abrir la caja", "abro la caja", "apertura"],
    purpose: [
      "Vender: buscar o escanear productos (cámara o lector), armar el carrito y cobrar con uno o varios métodos de pago.",
      "Emitir nota de venta, boleta o factura e imprimir el ticket.",
      "Poner una venta «a cuenta» de un cliente y cobrar después desde Cuentas pendientes.",
      "Abrir el turno de la caja física; sin caja abierta no se puede cobrar.",
    ],
    steps: [
      "Abre la caja con el monto inicial (panel de cajas → Abrir o Entrar).",
      "Escanea o busca el producto; toca la tarjeta para agregarlo al carrito y ajusta la cantidad.",
      "Pulsa Cobrar, elige el método de pago (efectivo, tarjeta, transferencia…) y el comprobante.",
      "Para fiar: «Poner a cuenta» con el nombre o un cliente registrado; se cobra luego en Cuentas pendientes.",
    ],
    tips: ["El cajero trabaja en su caja asignada; el dueño y el administrador pueden entrar a cualquiera.", "Las ventas en espera guardan un carrito para seguir después."],
  },
  {
    id: "cierre",
    title: "Cierre y arqueo de caja",
    href: "/caja/cierre",
    permission: "cashClose",
    keywords: ["cerrar caja", "cerrar la caja", "cierro la caja", "cierro caja", "cierre", "cierre de caja", "arqueo", "cuadre de caja", "cerrar turno", "conteo de billetes"],
    purpose: ["Cerrar el turno: contar el efectivo, confirmar cada medio de pago y ver la diferencia con lo esperado.", "Ver los productos vendidos en el turno y sus movimientos."],
    steps: [
      "Desde Caja, entra a Cierre de caja.",
      "Cuenta billetes y monedas (el conteo rápido avanza de mayor a menor).",
      "Confirma tarjeta, transferencia y otros medios; revisa la diferencia y cierra.",
    ],
    tips: ["Los cierres anteriores quedan en el historial de caja."],
  },
  {
    id: "ingreso",
    title: "Ingreso de caja",
    href: "/caja/ingreso",
    permission: "cash",
    keywords: ["ingreso de caja", "ingreso", "deposito", "entrada de dinero", "meter dinero"],
    purpose: ["Registrar dinero que entra a la caja sin ser una venta (sencillo, depósito, otros ingresos)."],
    steps: ["Abre Ingreso de caja, escribe el monto y el motivo, y guarda.", "Necesita la caja abierta; suma al efectivo esperado del cierre."],
  },
  {
    id: "egreso",
    title: "Egreso de caja",
    href: "/caja/egreso",
    permission: "cash",
    keywords: ["egreso de caja", "egreso", "retiro", "gasto", "sacar dinero", "pago de servicios"],
    purpose: ["Registrar dinero que sale de la caja: gastos, retiros o pagos menores."],
    steps: ["Abre Egreso de caja, escribe el monto y el motivo, y guarda.", "Resta del efectivo esperado del cierre y aparece en los informes de caja."],
  },
  {
    id: "historial-ventas",
    title: "Historial de ventas",
    href: "/ventas/historial",
    permission: "sell",
    keywords: ["historial de ventas", "historial", "ventas anteriores", "anular venta", "anulacion", "devolucion", "reimprimir", "devolver"],
    purpose: ["Buscar ventas pasadas con filtros tipo Excel; ver Ventas, Devoluciones y Anulaciones.", "Abrir el detalle de una venta para reimprimir, devolver productos o anularla (según permiso)."],
    steps: ["Filtra por fecha, cliente o vendedor.", "Abre la venta y usa Devolver o Anular; el stock se repone solo."],
  },
  {
    id: "productos",
    title: "Productos y marcas",
    href: "/productos",
    keywords: ["productos", "producto", "marcas", "marca", "nuevo producto", "precio de venta", "codigo de barras", "plantilla", "catalogo", "importar productos", "excel de productos", "foto del producto"],
    purpose: [
      "Crear y editar productos: marca, unidad, precio de compra y de venta, ganancia y margen, impuesto (gravado, exonerado o inafecto), stock mínimo y máximo, foto y código de barras.",
      "Organizar por marcas (lista a la izquierda); crear, renombrar o unir marcas.",
      "Descargar la plantilla Excel con todos los productos, cambiarla y subirla: solo se guarda lo nuevo y lo modificado.",
    ],
    steps: [
      "Nuevo producto → completa nombre, marca, precios e impuesto (por defecto Exonerado) → Guardar.",
      "Para cambiar muchos a la vez: Descargar plantilla → edita en Excel → Subir plantilla → revisa la vista previa → Guardar.",
      "Ver anulados muestra los productos eliminados para restaurarlos.",
    ],
    tips: ["Marcas y nombres se guardan en mayúsculas.", "Editar precios requiere el permiso «Modificar precios»."],
  },
  {
    id: "almacenes",
    title: "Almacenes",
    href: "/inventario/almacenes",
    keywords: ["almacenes", "almacen", "stock por almacen", "transferencia", "transferir", "mover stock", "plantilla de stock", "valor del inventario"],
    purpose: [
      "Ver el stock de cada producto por almacén y el valor del inventario.",
      "Mover mercadería entre almacenes (transferencias) y ajustar cantidades en una ventana.",
      "Plantilla Excel de stock: descargar, cambiar cantidades (columna amarilla por almacén) y subir; queda el ajuste en el kardex.",
    ],
    steps: ["Elige el almacén en los cuadros de arriba.", "Usa Mover o Ajustar en el producto, o el botón Transferencias.", "Las transferencias descuentan al enviar y suman al recibir."],
  },
  {
    id: "inventario",
    title: "Inventario y kardex",
    href: "/inventario/conteo",
    keywords: ["inventario", "toma de inventario", "conteo", "kardex", "mermas", "merma", "perdidas", "inventario ciego", "faltas y sobras", "cuadre de inventario", "movimientos de stock"],
    purpose: [
      "Toma de inventario: contar lo que hay en el almacén (ciego, corrección o faltas y sobras) y cuadrar con el sistema.",
      "Kardex: cada entrada y salida de un producto con su saldo.",
      "Mermas y pérdidas: registrar productos dañados, vencidos o perdidos; se descuentan del stock y de la ganancia.",
    ],
    steps: [
      "Toma de inventario → Iniciar → elige qué contar → cuenta con Cámara/Lector o a mano → cierra para ver el cuadre e informe.",
      "Kardex → busca el producto para ver su historial.",
      "Mermas → Registrar merma → producto, cantidad y causa.",
    ],
  },
  {
    id: "alertas",
    title: "Alertas de stock",
    href: "/inventario/alertas",
    keywords: ["alertas", "alertas de stock", "stock bajo", "agotados", "minimo", "por vencer", "vencimientos", "reponer"],
    purpose: ["Lista de productos agotados, bajo su stock mínimo o por vencer (avisos a 30 y 15 días) en el almacén actual."],
    steps: ["Revisa la lista cada día y pasa lo que falta a Compras → Requerimiento.", "El mínimo se define en cada producto."],
  },
  {
    id: "informes-inventario",
    title: "Informes de inventario",
    href: "/inventario/informes",
    permission: "reports",
    keywords: ["informes de inventario", "informe de stock", "productos a vencer", "valorizado", "informe de mermas", "informe de conteo"],
    purpose: ["Informes de stock valorizado, movimientos, mermas, tomas de inventario y productos a vencer, con exportación."],
    steps: ["Elige el tipo de informe en el panel, ajusta los filtros a la derecha y exporta si lo necesitas."],
  },
  {
    id: "proveedores",
    title: "Proveedores",
    href: "/compras/proveedores",
    permission: "purchases",
    keywords: ["proveedores", "proveedor", "nuevo proveedor", "pago pendiente", "por pagar", "cuentas por pagar", "deuda con proveedores", "credito de proveedor"],
    purpose: ["Registrar proveedores (RUC con consulta automática, contacto, pago contado o crédito con días).", "Pago pendiente: compras que aún se deben a proveedores y registrar sus pagos."],
    steps: ["Nuevo proveedor → RUC → completa datos → Guardar.", "Botón Pago pendiente → elige la compra → registra el pago."],
  },
  {
    id: "requerimiento",
    title: "Requerimiento de compra",
    href: "/compras/requerimiento",
    permission: "purchases",
    keywords: ["requerimiento", "pedido a proveedor", "que pedir", "orden de compra", "lista de compras"],
    purpose: ["Armar la lista de lo que hay que pedir (sugerido por stock bajo, por marca o búsqueda manual) y convertirla en compra."],
    steps: ["Revisa la sugerencia «qué pedir», ajusta cantidades y guarda el requerimiento.", "Luego recíbelo en Recepción cuando llegue la mercadería."],
  },
  {
    id: "recepcion",
    title: "Recepción de compras",
    href: "/compras/recepcion",
    permission: "purchases",
    keywords: ["recepcion", "recibir mercaderia", "registrar compra", "compra", "ingreso de mercaderia", "fecha de vencimiento"],
    purpose: ["Registrar la mercadería que llega: suma stock, actualiza el costo y opcionalmente el precio de venta y la fecha de vencimiento de cada producto."],
    steps: ["Elige el proveedor, agrega productos con cantidad y costo (en su unidad: und, kg, g…).", "Pon fecha de vencimiento si aplica y el pago (contado o pendiente) → Guardar."],
  },
  {
    id: "historial-compras",
    title: "Historial de compras",
    href: "/compras/historial",
    permission: "purchases",
    keywords: ["historial de compras", "compras anteriores", "detalle de compra"],
    purpose: ["Ver todas las compras con su estado (pendiente, parcial, recibida, anulada), total y lo pagado."],
    steps: ["Filtra por fecha o proveedor y abre el detalle para ver productos y pagos."],
  },
  {
    id: "clientes",
    title: "Clientes",
    href: "/clientes",
    permission: "customers",
    keywords: ["clientes", "cliente", "nuevo cliente", "dni", "ruc", "credito", "limite de credito", "abono", "deuda de cliente", "cuentas por cobrar"],
    purpose: ["Registrar clientes (consulta DNI/RUC), su límite de crédito y ver cuánto deben.", "Registrar abonos a sus deudas."],
    steps: ["Nuevo cliente → DNI o RUC → completa y guarda.", "Para cobrar una deuda: Caja → Cuentas pendientes, o el abono desde el cliente."],
  },
  {
    id: "historial-clientes",
    title: "Historial de clientes",
    href: "/clientes/historial",
    permission: "customers",
    keywords: ["historial de clientes", "compras de un cliente", "movimientos del cliente", "abonos"],
    purpose: ["Ver las compras, créditos y abonos de cada cliente."],
    steps: ["Busca al cliente y revisa sus movimientos."],
  },
  {
    id: "facturacion",
    title: "Facturación electrónica",
    href: "/facturacion",
    permission: "billing",
    keywords: ["facturacion", "facturacion electronica", "comprobantes", "sunat", "cdr", "xml", "nota de credito", "rechazado", "en cola"],
    purpose: ["Ver boletas, facturas y notas emitidas, su estado ante SUNAT (en cola, enviado, aceptado, rechazado) y descargar XML/CDR o reimprimir."],
    steps: ["Revisa los comprobantes en cola o con error y usa Reintentar.", "La aceptación real es el CDR de SUNAT; configura proveedor y series en Configuración."],
  },
  {
    id: "informes",
    title: "Informes",
    href: "/informes",
    permission: "reports",
    keywords: ["informes", "informe", "reporte", "reportes", "estadisticas", "utilidad", "ganancia", "exportar excel", "ventas por producto", "ventas por marca"],
    purpose: ["Informes de ventas (por día, producto, marca, vendedor, medio de pago, cliente), compras, caja, finanzas, clientes e inventario, con gráficos, totales y exportación."],
    steps: ["Elige el tipo en el panel lateral, el rango de fechas y filtros a la derecha.", "Exporta a Excel/CSV o PDF."],
  },
  {
    id: "configuracion",
    title: "Configuración",
    href: "/configuracion",
    permission: "settings",
    keywords: ["configuracion", "ajustes", "usuarios", "permisos", "roles", "negocio", "logo", "medios de pago", "impresora", "ticketera", "lector", "copias de seguridad", "backup", "series", "unidades", "sucursales", "cajas"],
    purpose: [
      "Datos del negocio (nombre, RUC, dirección, logo), usuarios y permisos, cajas, sucursales y almacenes.",
      "Medios de pago, unidades, ticketera y asistente de impresión, lector de código, facturación electrónica y copias de seguridad.",
    ],
    steps: ["Entra al módulo que necesitas en el panel de Configuración y guarda los cambios.", "Usuarios y permisos solo los gestionan el dueño y el administrador."],
  },
]

function allowed(ctx: TenantContext, guide: Guide) {
  if (guide.anyOf?.length) return guide.anyOf.some((permission) => can(ctx.role, permission, ctx.grants))
  return !guide.permission || can(ctx.role, guide.permission, ctx.grants)
}

export function guidesFor(ctx: TenantContext) {
  return GUIDES.filter((guide) => allowed(ctx, guide))
}

/** Busca la guía que mejor responde la pregunta. Devuelve también si existe pero el usuario no tiene permiso. */
export function findGuide(ctx: TenantContext, message: string): { guide: Guide; allowed: boolean } | null {
  const m = ` ${fold(message)} `
  let best: { guide: Guide; score: number } | null = null
  for (const guide of GUIDES) {
    let score = 0
    for (const keyword of guide.keywords) {
      const k = fold(keyword)
      if (m.includes(` ${k} `)) score += 10 + k.length
      else if (k.length > 4 && m.includes(k)) score += 4 + k.length / 2
    }
    if (fold(guide.title) && m.includes(fold(guide.title))) score += 25
    if (score > 0 && (!best || score > best.score)) best = { guide, score }
  }
  if (!best) return null
  return { guide: best.guide, allowed: allowed(ctx, best.guide) }
}

export function guideText(guide: Guide) {
  const lines = [`**${guide.title} — para qué sirve**`, ...guide.purpose.map((line) => `- ${line}`), "", "**Cómo se usa**", ...guide.steps.map((line, i) => `${i + 1}. ${line}`)]
  if (guide.tips?.length) lines.push("", ...guide.tips.map((tip) => `💡 ${tip}`))
  return lines.join("\n")
}
