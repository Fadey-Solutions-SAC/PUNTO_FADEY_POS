import type { PermissionGrant, Role } from "@/lib/roles"

export type TenantContext = {
  userId: string
  userName: string
  businessId: string
  businessName: string
  role: Role
  branchId: string
  branchName: string
  warehouseId: string
  warehouseName: string
  currency: string
  discountLimitPct: number
  allowCredit: boolean
  grants?: PermissionGrant[]
  configMode?: boolean
}

export type PriceMode = "SALE" | "RETAIL" | "WHOLESALE"

export type CatalogPresentation = {
  id: string
  name: string
  factorToBase: string
  price: string | null
  isDefault: boolean
  unitSymbol: string | null
}

export type CatalogProduct = {
  id: string
  name: string
  internalCode: string
  categoryId: string | null
  categoryName: string | null
  brandName: string | null
  baseUnitId: string
  baseUnit: string
  costPrice: string
  salePrice: string
  retailPrice: string
  wholesalePrice: string
  stock: string
  minStock: string
  isActive: boolean
  parentId: string | null
  variantName: string | null
  hasVariants: boolean
  trackLots: boolean
  imagePath: string | null
  barcodes: { code: string; presentationId: string }[]
  presentations: CatalogPresentation[]
}

export type PriceListShape = {
  id: string
  name: string
  isDefault: boolean
  items: { productId: string; presentationId: string; price: string }[]
}

export type SaleDraftInput = {
  idempotencyKey: string
  customerId?: string
  priceListId?: string
  mode: PriceMode
  discount: string
  notes?: string
  saleType?: "CASH" | "CREDIT"
  lines: { productId: string; presentationId: string; quantity: string }[]
}

export type SaleConfirmInput = SaleDraftInput & {
  draftId?: string
  saleType: "CASH" | "CREDIT"
  payments: { method: string; amount: string; reference?: string }[]
}
