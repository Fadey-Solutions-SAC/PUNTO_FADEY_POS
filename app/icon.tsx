import { brandIconPng } from "@/lib/brand-icon"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"
export const dynamic = "force-dynamic"

export default async function Icon() {
  return brandIconPng(32)
}
