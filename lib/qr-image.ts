"use client"

import { BarcodeFormat, EncodeHintType, QRCodeWriter } from "@zxing/library"

export function qrDataUrl(text: string, size = 320) {
  if (!text) return ""
  const hints = new Map<EncodeHintType, unknown>([[EncodeHintType.MARGIN, 1]])
  const matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints)
  const canvas = document.createElement("canvas")
  canvas.width = matrix.getWidth()
  canvas.height = matrix.getHeight()
  const context = canvas.getContext("2d")
  if (!context) return ""
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = "#000000"
  for (let y = 0; y < matrix.getHeight(); y += 1) {
    for (let x = 0; x < matrix.getWidth(); x += 1) {
      if (matrix.get(x, y)) context.fillRect(x, y, 1, 1)
    }
  }
  return canvas.toDataURL("image/png")
}
