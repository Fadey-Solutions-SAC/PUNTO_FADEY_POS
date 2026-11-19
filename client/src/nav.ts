/** Rutas aún no migradas: se muestran en el menú pero apuntan a un aviso. */
export function formatAppPath(href: string) {
  return `/pendiente${href === "/" ? "" : href}`
}
