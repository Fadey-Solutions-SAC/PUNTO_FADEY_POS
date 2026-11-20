/**
 * Reduce una imagen en el navegador antes de subirla (las fotos de celular pesan varios MB).
 * `keepAlpha` conserva PNG con transparencia (logos); si no, sale en JPEG con fondo blanco.
 */
export async function shrinkImage(
  file: File,
  { max = 600, quality = 0.85, keepAlpha = false }: { max?: number; quality?: number; keepAlpha?: boolean } = {},
): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("No se pudo leer la imagen"))
      el.src = url
    })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    const png = keepAlpha && file.type === "image/png"
    if (!png) {
      ctx.fillStyle = "#fff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", png ? undefined : quality),
    )
    return blob ?? file
  } finally {
    URL.revokeObjectURL(url)
  }
}
