import { prisma } from "../lib/db";
import { issueDocument, sendDocument, validRuc } from "../lib/billing";
import { saveCustomer, registerAbono } from "../lib/customers";
import { createPurchase, receivePurchase } from "../lib/purchases";
import { salesReport } from "../lib/reports";
import { assertCan } from "../lib/roles";
import { confirmSale, returnSale } from "../lib/sales";
import { openSession } from "../lib/cash";
import type { TenantContext } from "../lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function sampleRuc() {
  for (let n = 20000000000; n < 20000020000; n += 1) {
    const value = String(n);
    if (validRuc(value)) return value;
  }
  throw new Error("No se generó un RUC de prueba");
}

export async function runPart2(input: {
  ctxA: TenantContext;
  ctxB: TenantContext;
  productId: string;
  eachId: string;
  registerId: string;
}) {
  const before = await prisma.stockBalance.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: input.ctxA.warehouseId, productId: input.productId } },
  });
  const supplier = await prisma.supplier.create({
    data: { businessId: input.ctxA.businessId, tradeName: "Distribuidora Sur", taxId: "20100000001" },
  });
  const pending = await createPurchase(input.ctxA, {
    supplierId: supplier.id,
    documentNumber: "F001-9",
    idempotencyKey: "compra-pendiente",
    lines: [{ productId: input.productId, presentationId: input.eachId, quantity: "3", unitCost: "2.50" }],
  });
  const still = await prisma.stockBalance.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: input.ctxA.warehouseId, productId: input.productId } },
  });
  assert(still.quantity === before.quantity, "La compra pendiente aumentó el stock");
  assert(pending.total - pending.paid === 750, "La cuenta por pagar no quedó en 7.50");
  await receivePurchase(input.ctxA, pending.id);
  const after = await prisma.stockBalance.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: input.ctxA.warehouseId, productId: input.productId } },
  });
  assert(after.quantity === before.quantity + 30000, "Recibir 3 unidades no sumó 3 al stock");
  let crossed = false;
  try {
    await receivePurchase(input.ctxB, pending.id);
  } catch (error) {
    crossed = error instanceof Error && error.message.includes("no encontrada");
  }
  assert(crossed, "Otro negocio recibió la compra");

  await prisma.business.update({ where: { id: input.ctxA.businessId }, data: { allowCredit: true, taxId: sampleRuc() } });
  const customer = await saveCustomer(input.ctxA, { name: "Cliente Norte", document: "12345678", creditLimit: "100" });
  await openSession({ ...input.ctxA, allowCredit: true }, { cashRegisterId: input.registerId, openingAmount: "20" });
  const credit = await confirmSale({ ...input.ctxA, allowCredit: true }, {
    idempotencyKey: "venta-credito",
    mode: "SALE",
    discount: "0",
    saleType: "CREDIT",
    customerId: customer,
    lines: [{ productId: input.productId, presentationId: input.eachId, quantity: "1" }],
    payments: [],
  });
  const linked = await prisma.customer.findFirstOrThrow({ where: { id: customer } });
  assert(linked.balance === credit.total, "El crédito no quedó en el cliente");
  await registerAbono({ ...input.ctxA, allowCredit: true }, customer, "2", credit.id);
  const payment = await prisma.customerPayment.findFirstOrThrow({ where: { saleId: credit.id } });
  assert(payment.amount === 200, "El abono no quedó ligado a la venta");

  const document = await issueDocument({ ...input.ctxA, allowCredit: true }, credit.id, "BOLETA");
  assert(document.status === "QUEUED", "La boleta no quedó en cola");
  let accepted = false;
  try {
    await sendDocument({ ...input.ctxA, allowCredit: true }, document.id);
  } catch (error) {
    accepted = error instanceof Error && error.message.includes("no está aceptado");
  }
  const stored = await prisma.electronicDocument.findFirstOrThrow({ where: { id: document.id } });
  assert(accepted && stored.status !== "ACCEPTED", "Se marcó un comprobante como aceptado sin SUNAT");

  await prisma.permissionGrant.create({
    data: { businessId: input.ctxA.businessId, role: "CASHIER", permission: "sell", allowed: false },
  });
  let blocked = false;
  try {
    assertCan({ role: "CASHIER", grants: [{ role: "CASHIER", permission: "sell", allowed: false }] }, "sell");
  } catch (error) {
    blocked = error instanceof Error && error.message.includes("permiso");
  }
  assert(blocked, "El permiso denegado no se aplicó");

  const report = await salesReport(input.ctxA, { from: new Date("2020-01-01"), to: new Date("2100-01-01") });
  assert(report.total >= credit.total, "El informe no incluye la venta real");

  const line = credit.lines[0];
  if (!line) throw new Error("La venta a crédito no tiene líneas");
  let overDebt = false;
  try {
    await returnSale({ ...input.ctxA, allowCredit: true }, {
      saleId: credit.id,
      refundMethod: "CREDIT",
      lines: [{ saleLineId: line.id, quantity: "1" }],
    });
  } catch (error) {
    overDebt = error instanceof Error && error.message.includes("efectivo");
  }
  assert(overDebt, "La devolución a crédito superó la deuda ya abonada");
  const beforeReturn = await prisma.stockBalance.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: input.ctxA.warehouseId, productId: input.productId } },
  });
  await returnSale({ ...input.ctxA, allowCredit: true }, {
    saleId: credit.id,
    refundMethod: "CASH",
    lines: [{ saleLineId: line.id, quantity: "1" }],
  });
  const settled = await prisma.customer.findFirstOrThrow({ where: { id: customer } });
  assert(settled.balance === 0, "La devolución dejó saldo de crédito");
  const restored = await prisma.stockBalance.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId: input.ctxA.warehouseId, productId: input.productId } },
  });
  assert(restored.quantity === beforeReturn.quantity + 10000, "La devolución no repuso el stock");
  const refund = await prisma.cashMovement.findFirst({
    where: { businessId: input.ctxA.businessId, type: "EXPENSE", reason: { contains: "Devolución" } },
  });
  assert(refund?.amount === 200, "El efectivo devuelto no coincide con el abono");
  const afterReturn = await salesReport(input.ctxA, { from: new Date("2020-01-01"), to: new Date("2100-01-01") });
  assert(afterReturn.total === report.total - credit.total, "El informe no restó la devolución");
  console.log("Verificación de compras, crédito, facturación e informes correcta");
}
