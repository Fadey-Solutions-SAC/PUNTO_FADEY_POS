import { prisma } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { assertNoCode } from "@/lib/guard"
import { toPercentInt } from "@/lib/money"
import { assertCan } from "@/lib/roles"
import type { TenantContext } from "@/lib/types"

export async function updateBusiness(
  ctx: TenantContext,
  input: { name: string; legalName?: string; taxId?: string; currency: string; discountLimitPct: string; allowCredit: boolean },
) {
  assertCan(ctx, "settings")
  assertNoCode(input.name)
  assertNoCode(input.legalName ?? "")
  assertNoCode(input.taxId ?? "")
  assertNoCode(input.currency)
  const name = input.name.trim()
  const currency = input.currency.trim().toUpperCase()
  if (name.length < 2) throw new AppError("Indica el nombre del negocio")
  if (!/^[A-Z]{3}$/.test(currency)) throw new AppError("La moneda debe tener 3 letras, por ejemplo PEN")
  await prisma.business.updateMany({
    where: { id: ctx.businessId },
    data: {
      name,
      legalName: input.legalName?.trim() || null,
      taxId: input.taxId?.trim() || null,
      currency,
      discountLimitPct: toPercentInt(input.discountLimitPct || "0"),
      allowCredit: input.allowCredit,
    },
  })
}

export async function createBranch(ctx: TenantContext, input: { name: string; address?: string }) {
  assertCan(ctx, "settings")
  assertNoCode(input.name)
  assertNoCode(input.address ?? "")
  const name = input.name.trim()
  if (name.length < 2) throw new AppError("Indica el nombre de la sucursal")
  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.create({
      data: { businessId: ctx.businessId, name, address: input.address?.trim() || null },
    })
    await tx.warehouse.create({
      data: { businessId: ctx.businessId, branchId: branch.id, name: "Principal", isDefault: true },
    })
    await tx.cashRegister.create({
      data: { businessId: ctx.businessId, branchId: branch.id, name: "Caja 1" },
    })
    return branch
  })
}

export async function createWarehouse(ctx: TenantContext, name: string) {
  assertCan(ctx, "settings")
  const clean = name.trim()
  if (clean.length < 2) throw new AppError("Indica el nombre del almacén")
  return prisma.warehouse.create({
    data: { businessId: ctx.businessId, branchId: ctx.branchId, name: clean },
  })
}

export async function deleteWarehouse(ctx: TenantContext, warehouseId: string) {
  assertCan(ctx, "settings")
  const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, businessId: ctx.businessId } })
  if (!warehouse) throw new AppError("Almacén no encontrado")
  const others = await prisma.warehouse.findMany({
    where: { businessId: ctx.businessId, id: { not: warehouse.id }, isActive: true },
    orderBy: { name: "asc" },
  })
  if (others.length === 0) throw new AppError("Debe quedar un almacén")
  const [stock, lots, movements, sales, purchases, transfersFrom, transfersTo] = await Promise.all([
    prisma.stockBalance.count({ where: { warehouseId: warehouse.id, quantity: { not: 0 } } }),
    prisma.lot.count({ where: { warehouseId: warehouse.id, quantity: { not: 0 } } }),
    prisma.stockMovement.count({ where: { warehouseId: warehouse.id } }),
    prisma.sale.count({ where: { warehouseId: warehouse.id } }),
    prisma.purchase.count({ where: { warehouseId: warehouse.id } }),
    prisma.stockTransfer.count({ where: { fromWarehouseId: warehouse.id } }),
    prisma.stockTransfer.count({ where: { toWarehouseId: warehouse.id } }),
  ])
  if (stock > 0 || lots > 0) throw new AppError("Este almacén tiene productos y no se puede eliminar")
  if (movements + sales + purchases + transfersFrom + transfersTo > 0) {
    throw new AppError("Este almacén tiene movimientos y no se puede eliminar")
  }
  const replacement = others.find((item) => item.isDefault) ?? others[0]
  await prisma.$transaction(async (tx) => {
    if (warehouse.isDefault) {
      await tx.warehouse.update({ where: { id: replacement.id }, data: { isDefault: true } })
    }
    await tx.warehouse.delete({ where: { id: warehouse.id } })
  })
  return { replacementId: replacement.id, branchId: replacement.branchId }
}

export async function businessSnapshot(ctx: TenantContext) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } })
  const [branches, users] = await Promise.all([
    prisma.branch.findMany({
      where: { businessId: ctx.businessId },
      include: { warehouses: true, registers: true },
      orderBy: { name: "asc" },
    }),
    prisma.membership.findMany({
      where: { businessId: ctx.businessId, user: { email: { not: "configuracion@interno.fadey" } } },
      include: { user: { include: { permissions: { where: { businessId: ctx.businessId, allowed: true } } } }, register: true },
      orderBy: { user: { name: "asc" } },
    }),
  ])
  return { business, branches, users }
}
