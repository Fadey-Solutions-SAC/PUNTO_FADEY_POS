/**
 * Genera los íconos de la app a partir de public/brand/punto-fadey.jpg:
 * - icon-32/48/192/512.png: logo recortado en círculo, esquinas transparentes (navegador, PC, app instalada).
 * - icon-maskable-192/512.png: logo circular dentro de la zona segura (80 %) para Android,
 *   que recorta el ícono con la forma del lanzador sin cortar el logo.
 * - icon-180.png: Apple (iOS no admite transparencia: círculo sobre negro).
 *
 * Uso: node scripts/make-round-icons.mjs  (requiere sharp, que está en devDependencies)
 */
import path from "node:path"
import sharp from "sharp"

const root = process.cwd()
const source = path.join(root, "public", "brand", "punto-fadey.jpg")
const out = (name) => path.join(root, "public", "icons", name)

function circleMask(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  )
}

async function roundLogo(size) {
  return sharp(source)
    .resize(size, size, { fit: "cover" })
    .composite([{ input: circleMask(size), blend: "dest-in" }])
    .png()
    .toBuffer()
}

async function onBackground(size, logoRatio, background) {
  const inner = Math.round(size * logoRatio)
  const logo = await roundLogo(inner)
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer()
}

for (const size of [32, 48, 192, 512]) {
  await sharp(await roundLogo(size)).toFile(out(`icon-${size}.png`))
}
for (const size of [192, 512]) {
  await sharp(await onBackground(size, 0.8, "#05070d")).toFile(out(`icon-maskable-${size}.png`))
}
await sharp(await onBackground(180, 1, "#000000")).toFile(out("icon-180.png"))

console.log("Íconos circulares generados en public/icons")
