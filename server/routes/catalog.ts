import express, { type Express } from "express"
import { deleteNamed, exportCatalogCsv, getProductForm, importCatalogCsv, loadCatalog, saveNamed, saveProduct, saveProductImage } from "../../lib/catalog"
import { errorMessage } from "../../lib/errors"
import { formatMoney, toMoneyInt } from "../../lib/money"
import { prisma } from "../../lib/db"
import { can } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

export function registerCatalogRoutes(app: Express) {
  app.get("/api/catalog", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const [products, categories, brands] = await Promise.all([
        loadCatalog(ctx),
        prisma.category.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
        prisma.brand.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
      ])
      const parents = products.filter((product) => !product.parentId)
      res.json({
        currency: ctx.currency,
        writable: can(ctx.role, "catalogWrite", ctx.grants),
        categories: categories.map((category) => ({ id: category.id, name: category.name })),
        brands: brands.map((brand) => ({ id: brand.id, name: brand.name })),
        products: parents.map((product) => ({
          id: product.id,
          code: product.internalCode,
          name: product.name,
          categoryId: product.categoryId,
          categoryName: product.categoryName,
          brandId: product.brandId,
          brandName: product.brandName,
          price: formatMoney(toMoneyInt(product.salePrice), ctx.currency),
          cost: Number(product.costPrice) > 0 ? formatMoney(toMoneyInt(product.costPrice), ctx.currency) : "",
          stock: `${product.stock} ${product.baseUnit}`,
          stockValue: Number(String(product.stock).replace(/,/g, "")) || 0,
          minStock: Number(String(product.minStock).replace(/,/g, "")) || 0,
          active: product.isActive,
          imagePath: (product as { imagePath?: string | null }).imagePath ?? null,
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/catalog/form", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "catalogWrite", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso de catálogo" })
        return
      }
      const [categories, units] = await Promise.all([
        prisma.category.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
        prisma.unit.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
      ])
      const brands = await prisma.brand.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      res.json({
        categories: categories.map((category) => ({ id: category.id, name: category.name })),
        units: units.map((unit) => ({ id: unit.id, name: unit.name, symbol: unit.symbol })),
        brands,
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/catalog/products/:id", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const form = await getProductForm(ctx, String(req.params.id))
      const [categories, units] = await Promise.all([
        prisma.category.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
        prisma.unit.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
      ])
      const brands = await prisma.brand.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      res.json({
        writable: can(ctx.role, "catalogWrite", ctx.grants),
        values: form.values,
        imagePath: form.product.imagePath ?? null,
        categories: categories.map((category) => ({ id: category.id, name: category.name })),
        units: units.map((unit) => ({ id: unit.id, name: unit.name, symbol: unit.symbol })),
        brands,
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // Foto del producto: cuerpo binario (image/jpeg|png|webp), máx. 2 MB. La guarda en uploads del disco.
  app.post(
    "/api/catalog/products/:id/image",
    requireApiTenant,
    express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "2mb" }),
    async (req: AuthedRequest, res) => {
      try {
        const ctx = req.tenant!
        const type = String(req.headers["content-type"] ?? "").split(";")[0].trim()
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          res.status(400).json({ error: "Usa una imagen JPG, PNG o WebP" })
          return
        }
        const file = new File([new Uint8Array(req.body)], "imagen", { type })
        await saveProductImage(ctx, String(req.params.id), file)
        const product = await prisma.product.findFirst({
          where: { id: String(req.params.id), businessId: ctx.businessId },
          select: { imagePath: true },
        })
        res.json({ ok: true, imagePath: product?.imagePath ?? null })
      } catch (error) {
        res.status(400).json({ error: errorMessage(error) })
      }
    },
  )

  // Eliminar (anular) o restaurar un producto: se desactiva, no se borra, para conservar su historial.
  app.post("/api/catalog/products/:id/active", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      if (!can(ctx.role, "catalogWrite", ctx.grants)) {
        res.status(403).json({ error: "Sin permiso para modificar productos" })
        return
      }
      const active = req.body?.active === true
      const product = await prisma.product.findFirst({ where: { id: String(req.params.id), businessId: ctx.businessId } })
      if (!product) {
        res.status(404).json({ error: "Producto no encontrado" })
        return
      }
      await prisma.product.update({ where: { id: product.id }, data: { isActive: active } })
      await prisma.auditLog.create({
        data: {
          businessId: ctx.businessId,
          userId: ctx.userId,
          action: active ? "PRODUCT_RESTORE" : "PRODUCT_VOID",
          entity: "Product",
          entityId: product.id,
          detail: `${product.name}: ${active ? "restaurado" : "anulado"}`,
        },
      })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/catalog/products", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const product = await saveProduct(ctx, {
        id: req.body?.id ? String(req.body.id) : undefined,
        name: String(req.body?.name ?? ""),
        internalCode: req.body?.internalCode ? String(req.body.internalCode) : undefined,
        categoryId: req.body?.categoryId ? String(req.body.categoryId) : undefined,
        brandName: req.body?.brandName != null ? String(req.body.brandName) : undefined,
        baseUnitId: String(req.body?.baseUnitId ?? ""),
        description: req.body?.description != null ? String(req.body.description) : undefined,
        costPrice: String(req.body?.costPrice ?? "0"),
        salePrice: String(req.body?.salePrice ?? "0"),
        wholesalePrice: String(req.body?.wholesalePrice ?? "0"),
        retailPrice: String(req.body?.retailPrice ?? "0"),
        minStock: String(req.body?.minStock ?? "0"),
        maxStock: req.body?.maxStock ? String(req.body.maxStock) : undefined,
        taxType: req.body?.taxType ? String(req.body.taxType) : undefined,
        initialQuantity: req.body?.initialQuantity ? String(req.body.initialQuantity) : undefined,
        trackLots: Boolean(req.body?.trackLots),
        isActive: req.body?.isActive !== false,
        barcodes: Array.isArray(req.body?.barcodes)
          ? req.body.barcodes.map((code: unknown) => String(code ?? ""))
          : req.body?.barcode
            ? [String(req.body.barcode)]
            : [],
        presentations: Array.isArray(req.body?.presentations) ? req.body.presentations : [],
      })
      res.json({ ok: true, id: product.id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/catalog/categories", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      await saveNamed(req.tenant!, "category", String(req.body?.name ?? ""))
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // Categorías y marcas con cuántos productos las usan.
  app.get("/api/catalog/taxonomy", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const [categories, brands] = await Promise.all([
        prisma.category.findMany({ where: { businessId: ctx.businessId }, include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } }),
        prisma.brand.findMany({ where: { businessId: ctx.businessId }, include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } }),
      ])
      res.json({
        writable: can(ctx.role, "catalogWrite", ctx.grants),
        categories: categories.map((item) => ({ id: item.id, name: item.name, products: item._count.products })),
        brands: brands.map((item) => ({ id: item.id, name: item.name, products: item._count.products })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  for (const [kind, path] of [
    ["category", "categories"],
    ["brand", "brands"],
  ] as const) {
    if (kind === "brand") {
      app.post(`/api/catalog/${path}`, requireApiTenant, async (req: AuthedRequest, res) => {
        try {
          await saveNamed(req.tenant!, kind, String(req.body?.name ?? ""))
          res.json({ ok: true })
        } catch (error) {
          res.status(400).json({ error: errorMessage(error) })
        }
      })
    }
    app.put(`/api/catalog/${path}/:id`, requireApiTenant, async (req: AuthedRequest, res) => {
      try {
        await saveNamed(req.tenant!, kind, String(req.body?.name ?? ""), String(req.params.id))
        res.json({ ok: true })
      } catch (error) {
        res.status(400).json({ error: errorMessage(error) })
      }
    })
    app.delete(`/api/catalog/${path}/:id`, requireApiTenant, async (req: AuthedRequest, res) => {
      try {
        await deleteNamed(req.tenant!, kind, String(req.params.id))
        res.json({ ok: true })
      } catch (error) {
        res.status(400).json({ error: errorMessage(error) })
      }
    })
  }

  // Importar productos desde CSV (texto). dryRun = solo revisar, sin guardar.
  app.post("/api/catalog/import", requireApiTenant, express.json({ limit: "5mb" }), async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const result = await importCatalogCsv(ctx, String(req.body?.csv ?? ""), { dryRun: req.body?.dryRun === true })
      if (!req.body?.dryRun && !result.errors.length) {
        await prisma.auditLog.create({
          data: { businessId: ctx.businessId, userId: ctx.userId, action: "catalog.import", entity: "Product", detail: `${result.created} nuevos · ${result.updated} actualizados` },
        })
      }
      res.json(result)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // Exportar el catálogo (sirve también de plantilla para importar).
  app.get("/api/catalog/export", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const csv = await exportCatalogCsv(ctx)
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="catalogo-${new Date().toLocaleDateString("en-CA")}.csv"`)
      res.send(`\ufeff${csv}`)
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
