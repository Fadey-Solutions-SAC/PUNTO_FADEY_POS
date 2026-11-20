import { useState, type ChangeEvent } from "react"
import { uploadProductImage } from "../api"
import { categoryColor } from "../colors"

/** Reduce la foto (las de celular pesan varios MB) a máx. 600 px en JPEG antes de subirla. */
async function shrinkImage(file: File, max = 600): Promise<Blob> {
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
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85))
    return blob ?? file
  } finally {
    URL.revokeObjectURL(url)
  }
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

/**
 * Foto del producto en círculo. Con `editable`, tocarla abre la cámara/galería y la sube.
 * Sin foto muestra las iniciales con el color de la categoría.
 */
export function ProductPhoto({
  name,
  imagePath,
  productId,
  categoryId,
  size = 40,
  editable = false,
  onUploaded,
}: {
  name: string
  imagePath?: string | null
  productId?: string
  categoryId?: string | null
  size?: number
  editable?: boolean
  onUploaded?: (imagePath: string | null) => void
}) {
  const [preview, setPreview] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [broken, setBroken] = useState(false)
  const src = preview || (broken ? "" : imagePath || "")
  const color = categoryColor(categoryId)
  const box = { width: size, height: size }

  const circle = src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm"
      style={box}
    />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-white shadow-sm ring-2 ring-white"
      style={{ ...box, background: color, fontSize: Math.max(10, size * 0.36) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )

  if (!editable || !productId) return circle

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !productId) return
    if (!file.type.startsWith("image/")) {
      setError("Elige una imagen")
      return
    }
    setError("")
    setPending(true)
    const local = URL.createObjectURL(file)
    setPreview(local)
    try {
      const blob = await shrinkImage(file)
      const result = await uploadProductImage(productId, blob)
      setBroken(false)
      onUploaded?.(result.imagePath)
    } catch (err) {
      setPreview("")
      setError(err instanceof Error ? err.message : "No se pudo subir")
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <label
        className={`group relative cursor-pointer ${pending ? "opacity-60" : ""}`}
        title={`Cambiar foto de ${name}`}
      >
        {circle}
        <span
          className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-[var(--pf-accent)] text-[11px] font-bold text-white shadow ring-2 ring-white transition group-hover:scale-110"
          aria-hidden
        >
          {pending ? "…" : "+"}
        </span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onChange}
          disabled={pending}
          aria-label={`Cargar foto de ${name}`}
        />
      </label>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  )
}
