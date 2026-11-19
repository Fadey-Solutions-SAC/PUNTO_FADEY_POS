import type { Express } from "express"
import { loadCatalog } from "../../lib/catalog"
import { errorMessage } from "../../lib/errors"
import { formatMoney, toMoneyInt } from "../../lib/money"
import { prisma } from "../../lib/db"
import { can } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

export function registerCatalogRoutes(app: Express) {
  app.get("/api/catalog", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const [products, categories] = await Promise.all([
        loadCatalog(ctx),
        prisma.category.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
      ])
      const parents = products.filter((product) => !product.parentId)
      res.json({
        currency: ctx.currency,
        writable: can(ctx.role, "catalogWrite", ctx.grants),
        categories: categories.map((category) => ({ id: category.id, name: category.name })),
        products: parents.map((product) => ({
          id: product.id,
          code: product.internalCode,
          name: product.name,
          categoryId: product.categoryId,
          categoryName: product.categoryName,
          brandName: product.brandName,
          price: formatMoney(toMoneyInt(product.salePrice), ctx.currency),
          stock: `${product.stock} ${product.baseUnit}`,
          active: product.isActive,
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
