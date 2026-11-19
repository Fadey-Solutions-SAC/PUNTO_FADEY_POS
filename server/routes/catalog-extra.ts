import type { Express } from "express"
import {
  addBarcode,
  createPriceList,
  savePriceListItem,
  saveUnit,
} from "../../lib/catalog"
import { errorMessage } from "../../lib/errors"
import { formatMoney, formatQty } from "../../lib/money"
import { prisma } from "../../lib/db"
import { can } from "../../lib/roles"
import { requireApiTenant, type AuthedRequest } from "../tenant"

const DIMENSION: Record<string, string> = {
  UNIT: "Unidad",
  WEIGHT: "Peso",
  LENGTH: "Longitud",
  VOLUME: "Volumen",
}

export function registerCatalogExtraRoutes(app: Express) {
  app.get("/api/catalog/units", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const [units, conversions] = await Promise.all([
        prisma.unit.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: "asc" } }),
        prisma.unitConversion.findMany({
          where: { businessId: ctx.businessId },
          include: { fromUnit: true, toUnit: true },
        }),
      ])
      res.json({
        writable: can(ctx.role, "catalogWrite", ctx.grants),
        units: units.map((unit) => ({
          id: unit.id,
          name: unit.name,
          symbol: unit.symbol,
          dimension: unit.dimension,
          dimensionLabel: DIMENSION[unit.dimension] ?? unit.dimension,
        })),
        conversions: conversions.map((row) => ({
          id: row.id,
          from: row.fromUnit.symbol,
          to: row.toUnit.symbol,
          factor: (row.factor / 10000).toString(),
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/catalog/units", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      await saveUnit(ctx, {
        name: String(req.body?.name ?? ""),
        symbol: String(req.body?.symbol ?? ""),
        dimension: String(req.body?.dimension ?? "UNIT"),
      })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/catalog/presentations", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const rows = await prisma.presentation.findMany({
        where: { businessId: ctx.businessId, isActive: true },
        include: { product: { include: { baseUnit: true } }, unit: true },
        orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
      })
      res.json({
        rows: rows.map((row) => ({
          id: row.id,
          productId: row.productId,
          productName: row.product.name,
          name: row.name,
          factorLabel: formatQty(row.factorToBase),
          unitSymbol: row.unit?.symbol ?? row.product.baseUnit.symbol,
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/catalog/barcodes", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const [codes, products] = await Promise.all([
        prisma.productBarcode.findMany({
          where: { businessId: ctx.businessId },
          include: { product: true },
          orderBy: { code: "asc" },
        }),
        prisma.product.findMany({
          where: { businessId: ctx.businessId, isActive: true },
          orderBy: { name: "asc" },
        }),
      ])
      res.json({
        writable: can(ctx.role, "catalogWrite", ctx.grants),
        products: products.map((product) => ({ id: product.id, name: product.name })),
        codes: codes.map((code) => ({ id: code.id, code: code.code, productName: code.product.name })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/catalog/barcodes", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      await addBarcode(ctx, String(req.body?.productId ?? ""), String(req.body?.code ?? ""))
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.get("/api/catalog/prices", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const [lists, products] = await Promise.all([
        prisma.priceList.findMany({
          where: { businessId: ctx.businessId },
          include: { items: { include: { product: true } } },
          orderBy: { name: "asc" },
        }),
        prisma.product.findMany({
          where: { businessId: ctx.businessId, isActive: true },
          orderBy: { name: "asc" },
        }),
      ])
      res.json({
        currency: ctx.currency,
        canCreateList: can(ctx.role, "catalogWrite", ctx.grants),
        canSavePrice: can(ctx.role, "priceWrite", ctx.grants),
        products: products.map((product) => ({ id: product.id, name: product.name })),
        lists: lists.map((list) => ({
          id: list.id,
          name: list.name,
          items: list.items.map((item) => ({
            id: item.id,
            productName: item.product.name,
            price: formatMoney(item.price, ctx.currency),
          })),
        })),
      })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/catalog/prices/lists", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const list = await createPriceList(ctx, String(req.body?.name ?? ""))
      res.json({ ok: true, id: list.id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/catalog/prices/items", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      await savePriceListItem(ctx, {
        listId: String(req.body?.listId ?? ""),
        productId: String(req.body?.productId ?? ""),
        price: String(req.body?.price ?? "0"),
      })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })
}
