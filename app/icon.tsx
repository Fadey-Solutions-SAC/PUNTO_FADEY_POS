import { readFile } from "node:fs/promises"
import path from "node:path"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default async function Icon() {
  return readFile(path.join(process.cwd(), "public", "icons", "icon-32.png"))
}
