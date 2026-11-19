import { readFile } from "node:fs/promises"
import path from "node:path"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default async function AppleIcon() {
  return readFile(path.join(process.cwd(), "public", "icons", "icon-180.png"))
}
