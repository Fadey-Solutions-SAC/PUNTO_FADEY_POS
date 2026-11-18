import { prisma } from "../lib/db";
import { loadCatalog, saveProduct } from "../lib/catalog";
import { closeSession, openSession, summarizeSession } from "../lib/cash";
import { receiveTransfer, sendTransfer, stockIn } from "../lib/inventory";
import { confirmSale, readDraft, saveDraft } from "../lib/sales";
import { createUser, registerOwner } from "../lib/setup";
import { runPart2 } from "./verify-part2";
import type { TenantContext } from "../lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

export async function run() {
  const ownerA = await registerOwner({
    name: "Ana",
    email: "ana@fadey.test",
    password: "clave-segura",
    businessName: "Bodega Ana",
    branchName: "Principal",
  });
  const ownerB = await registerOwner({
    name: "Beto",
    email: "beto@fadey.test",
    password: "clave-segura",
    businessName: "Ferretería Beto",
    branchName: "Principal",
  });

  const businessA = await prisma.business.findUniqueOrThrow({ where: { id: ownerA.businessId } });
  const unit = await prisma.unit.findFirstOrThrow({ where: { businessId: ownerA.businessId, symbol: "und" } });
  const ctxA: TenantContext = {
    userId: ownerA.user.id,
    userName: "Ana",
    businessId: ownerA.businessId,
    businessName: "Bodega Ana",
    role: "OWNER",
    branchId: ownerA.branchId,
    branchName: "Principal",
    warehouseId: ownerA.warehouseId,
    warehouseName: "Principal",
    currency: businessA.currency,
    discountLimitPct: businessA.discountLimitPct,
    allowCredit: businessA.allowCredit,
  };
  const ctxB: TenantContext = {
    ...ctxA,
    userId: ownerB.user.id,
    userName: "Beto",
    businessId: ownerB.businessId,
    businessName: "Ferretería Beto",
    branchId: ownerB.branchId,
    warehouseId: ownerB.warehouseId,
  };

  const product = await saveProduct(ctxA, {
    name: "Aceite",
    internalCode: "ACE-1",
    baseUnitId: unit.id,
    costPrice: "3",
    salePrice: "5",
    retailPrice: "5",
    wholesalePrice: "4",
    minStock: "2",
    trackLots: false,
    isActive: true,
    barcodes: ["7750001000012"],
    presentations: [
      { name: "Unidad", factorToBase: "1", isDefault: true },
      { name: "Caja x12", factorToBase: "12", price: "50", isDefault: false },
    ],
  });
  const full = await prisma.product.findFirstOrThrow({
    where: { id: product.id },
    include: { presentations: true },
  });
  const box = full.presentations.find((item) => item.name === "Caja x12");
  const each = full.presentations.find((item) => item.name === "Unidad");
  if (!box || !each) throw new Error("Faltan presentaciones");

  let blocked = false;
  try {
    await confirmSale(ctxA, {
      idempotencyKey: "sin-caja",
      mode: "SALE",
      discount: "0",
      saleType: "CASH",
      lines: [{ productId: product.id, presentationId: each.id, quantity: "1" }],
      payments: [{ method: "CASH", amount: "5" }],
    });
  } catch (error) {
    blocked = error instanceof Error && error.message.includes("caja");
  }
  assert(blocked, "La venta sin caja no fue rechazada");

  await stockIn(ctxA, {
    productId: product.id,
    presentationId: box.id,
    quantity: "1",
    type: "PURCHASE",
    reason: "Compra de prueba",
  });
  const afterIn = await prisma.stockBalance.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: ctxA.warehouseId, productId: product.id } },
  });
  assert(afterIn.quantity === 120000, `La caja no se convirtió a 12 unidades: ${afterIn.quantity}`);

  let leaked = false;
  try {
    await stockIn(ctxB, {
      productId: product.id,
      quantity: "1",
      type: "ENTRY",
      reason: "Intento cruzado",
    });
  } catch (error) {
    leaked = error instanceof Error && error.message.includes("no encontrado");
  }
  assert(leaked, "El otro negocio pudo mover el producto");
  const catalogB = await loadCatalog(ctxB);
  assert(catalogB.length === 0, "El catálogo cruzó de negocio");

  await openSession(ctxA, { cashRegisterId: ownerA.registerId, openingAmount: "100" });
  const parked = await saveDraft(ctxA, {
    idempotencyKey: "venta-1",
    mode: "SALE",
    discount: "1",
    lines: [{ productId: product.id, presentationId: each.id, quantity: "1" }],
  });
  assert(parked.status === "DRAFT" && parked.lines.length === 1, "La venta pendiente no guardó el producto");
  assert(parked.lines[0].quantity === 10000, "La cantidad pendiente no se guardó");
  assert(parked.total === 400, `El total pendiente no aplicó el descuento: ${parked.total}`);
  const stockWhileDraft = await prisma.stockBalance.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: ctxA.warehouseId, productId: product.id } },
  });
  assert(stockWhileDraft.quantity === 120000, "La venta pendiente movió inventario");
  const updated = await saveDraft(ctxA, {
    idempotencyKey: "venta-1",
    mode: "SALE",
    discount: "0",
    lines: [{ productId: product.id, presentationId: each.id, quantity: "2" }],
  });
  assert(updated.id === parked.id, "Actualizar la pendiente creó otra venta");
  assert(updated.lines.length === 1 && updated.lines[0].quantity === 20000, "Actualizar la pendiente duplicó o borró líneas");
  const resumed = await readDraft(ctxA, parked.id);
  assert(resumed.lines.length === 1 && resumed.lines[0].quantity === "2", "Al retomar se perdieron los productos");
  assert(resumed.idempotencyKey === "venta-1", "Al retomar se perdió la clave de la venta");
  let foreignDraft = false;
  try {
    await readDraft(ctxB, parked.id);
  } catch (error) {
    foreignDraft = error instanceof Error && error.message.includes("no está disponible");
  }
  assert(foreignDraft, "Otro negocio pudo leer la venta pendiente");

  const sale = await confirmSale(ctxA, {
    idempotencyKey: "venta-1",
    mode: "SALE",
    discount: "0",
    saleType: "CASH",
    lines: [{ productId: product.id, presentationId: each.id, quantity: "2" }],
    payments: [{ method: "CASH", amount: "20" }],
  });
  const replay = await confirmSale(ctxA, {
    idempotencyKey: "venta-1",
    mode: "SALE",
    discount: "0",
    saleType: "CASH",
    lines: [{ productId: product.id, presentationId: each.id, quantity: "2" }],
    payments: [{ method: "CASH", amount: "10" }],
  });
  assert(replay.id === sale.id, "La reintento creó otra venta");
  assert(sale.id === parked.id, "Cobrar la pendiente creó otra venta");
  const chargedLines = await prisma.saleLine.count({ where: { saleId: sale.id } });
  assert(chargedLines === 1, "Cobrar la pendiente duplicó las líneas");
  const afterSale = await prisma.stockBalance.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: ctxA.warehouseId, productId: product.id } },
  });
  assert(afterSale.quantity === 100000, `El stock no quedó en 10: ${afterSale.quantity}`);
  const saleCount = await prisma.sale.count({ where: { businessId: ctxA.businessId, status: "COMPLETED" } });
  assert(saleCount === 1, "Se duplicó la venta");

  const depot = await prisma.warehouse.create({
    data: { businessId: ctxA.businessId, branchId: ctxA.branchId, name: "Depósito" },
  });
  const transfer = await sendTransfer(ctxA, {
    toWarehouseId: depot.id,
    notes: "Reposición",
    lines: [{ productId: product.id, presentationId: each.id, quantity: "4" }],
  });
  const originAfterSend = await prisma.stockBalance.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: ctxA.warehouseId, productId: product.id } },
  });
  assert(originAfterSend.quantity === 60000, "La salida de transferencia no descontó 4");
  await receiveTransfer(ctxA, transfer.id);
  const destination = await prisma.stockBalance.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: depot.id, productId: product.id } },
  });
  assert(destination.quantity === 40000, "El destino no recibió 4");

  const summary = await summarizeSession(ctxA, (await prisma.cashSession.findFirstOrThrow({ where: { userId: ctxA.userId, status: "OPEN" } })).id);
  assert(summary.expected === 11000, `Efectivo esperado incorrecto: ${summary.expected}`);
  await closeSession(ctxA, { counted: "110", notes: "Cuadra" });
  const closed = await prisma.cashSession.findFirstOrThrow({ where: { userId: ctxA.userId, status: "CLOSED" } });
  assert(closed.difference === 0, "La diferencia de caja no quedó en cero");

  const cashier = await createUser(ctxA.businessId, "OWNER", {
    name: "Caja",
    email: "caja@fadey.test",
    password: "clave-segura",
    role: "CASHIER",
  });
  const register = await prisma.cashRegister.create({
    data: { businessId: ctxA.businessId, branchId: ctxA.branchId, name: "Caja 2" },
  });
  const ctxCashier: TenantContext = { ...ctxA, userId: cashier.id, userName: "Caja", role: "CASHIER" };
  await openSession(ctxCashier, { cashRegisterId: register.id, openingAmount: "0" });
  let denied = false;
  try {
    await confirmSale(ctxCashier, {
      idempotencyKey: "descuento-alto",
      mode: "SALE",
      discount: "2.50",
      saleType: "CASH",
      lines: [{ productId: product.id, presentationId: each.id, quantity: "1" }],
      payments: [{ method: "CASH", amount: "2.50" }],
    });
  } catch (error) {
    denied = error instanceof Error && error.message.includes("permiso");
  }
  assert(denied, "El cajero aplicó un descuento sobre el tope");

  const moves = await prisma.stockMovement.count({ where: { businessId: ctxA.businessId, productId: product.id } });
  assert(moves >= 4, "Faltan movimientos de kardex");
  await runPart2({
    ctxA,
    ctxB,
    productId: product.id,
    eachId: each.id,
    registerId: ownerA.registerId,
  });
  console.log("Verificación de Punto Fadey correcta");
  await prisma.$disconnect();
}
