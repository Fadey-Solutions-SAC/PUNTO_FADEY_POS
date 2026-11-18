import { formatQty, fromMoneyInt, mulScale, QTY_SCALE, toFactorInt, toMoneyInt, toQtyInt } from "@/lib/money"
import type { PriceMode } from "@/lib/types"

export type PriceProduct = {
  id: string
  salePrice: number
  retailPrice: number
  wholesalePrice: number
}

export type PricePresentation = {
  id: string
  factorToBase: number
  price: number | null
}

export type PriceItem = {
  productId: string
  presentationId: string
  price: number
}

export function resolveUnitPriceCents(args: {
  product: PriceProduct
  presentation: PricePresentation
  mode: PriceMode
  listItems?: PriceItem[] | null
}) {
  const items = args.listItems
  const specific = items?.find(
    (item) => item.productId === args.product.id && item.presentationId === args.presentation.id,
  )
  if (specific) return specific.price

  const baseItem = items?.find((item) => item.productId === args.product.id && item.presentationId === "")
  if (baseItem) return mulScale(baseItem.price, args.presentation.factorToBase)

  if (!items && args.presentation.price != null) return args.presentation.price

  const tier =
    args.mode === "RETAIL"
      ? args.product.retailPrice
      : args.mode === "WHOLESALE"
        ? args.product.wholesalePrice
        : args.product.salePrice
  return mulScale(tier, args.presentation.factorToBase)
}

export function resolveUnitPriceText(args: {
  product: { id: string; salePrice: string; retailPrice: string; wholesalePrice: string }
  presentation: { id: string; factorToBase: string; price: string | null }
  mode: PriceMode
  listItems?: { productId: string; presentationId: string; price: string }[] | null
}) {
  const cents = resolveUnitPriceCents({
    product: {
      id: args.product.id,
      salePrice: toMoneyInt(args.product.salePrice),
      retailPrice: toMoneyInt(args.product.retailPrice),
      wholesalePrice: toMoneyInt(args.product.wholesalePrice),
    },
    presentation: {
      id: args.presentation.id,
      factorToBase: toFactorInt(args.presentation.factorToBase),
      price: args.presentation.price ? toMoneyInt(args.presentation.price) : null,
    },
    mode: args.mode,
    listItems: args.listItems?.map((item) => ({
      productId: item.productId,
      presentationId: item.presentationId,
      price: toMoneyInt(item.price),
    })),
  })
  return fromMoneyInt(cents).toFixed(2)
}

export function tierLabel(mode: PriceMode) {
  if (mode === "RETAIL") return "Minorista"
  if (mode === "WHOLESALE") return "Mayorista"
  return "Precio de venta"
}

export function stockInPresentation(stockBase: string, factor: string) {
  const factorInt = toFactorInt(factor)
  return formatQty(Math.floor((toQtyInt(stockBase) * QTY_SCALE) / factorInt))
}
