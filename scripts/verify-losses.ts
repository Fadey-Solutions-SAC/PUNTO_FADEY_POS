import { prisma } from "../lib/db";
import { listLosses, registerLoss, voidLoss } from "../lib/losses";
import type { TenantContext } from "../lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function expectError(fn: () => Promise<unknown>, contains: string, message: string) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(contains), `${message} (mensaje: ${(error as Error).message})`);
    return;
  }
  throw new Error(message);
}

/** Mermas y pérdidas: stock, costo, kardex, permisos, aislamiento y reversión. */
export async function runLosses(input: { ctxA: TenantContext; ctxB: TenantContext; productId: string; eachId: string }) {
  const { ctxA, ctxB, productId, eachId } = input;
  const balance = () =>
    prisma.stockBalance
      .findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId: ctxA.warehouseId, productId } } })
      .then((row) => row.quantity);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  const before = await balance();
  assert(before >= 20000, "El producto de prueba necesita al menos 2 unidades");

  // 1. Registrar 2 unidades vencidas: baja stock, valoriza al costo y deja kardex enlazado.
  const loss = await registerLoss(ctxA, { productId, presentationId: eachId, quantity: "2", type: "SHRINKAGE", cause: "Vencido" });
  assert((await balance()) === before - 20000, "La merma no descontó 2 unidades");
  assert(loss.totalCost === product.costPrice * 2, `El costo de la merma no es 2 × costo (${loss.totalCost})`);
  const move = await prisma.stockMovement.findFirst({ where: { referenceType: "STOCK_LOSS", referenceId: loss.id, type: "SHRINKAGE" } });
  assert(move && loss.movementId === move.id && move.direction === "OUT", "La merma no quedó en el kardex");

  // 2. Validaciones.
  await expectError(
    () => registerLoss(ctxA, { productId, presentationId: eachId, quantity: "999999", type: "LOSS", cause: "Robo" }),
    "",
    "Se permitió una merma mayor al stock",
  );
  assert((await balance()) === before - 20000, "Una merma rechazada cambió el stock");
  await expectError(
    () => registerLoss(ctxA, { productId, presentationId: eachId, quantity: "1", type: "LOSS", cause: "Vencido" }),
    "causa",
    "Aceptó una causa que no corresponde al tipo",
  );
  await expectError(
    () => registerLoss(ctxA, { productId, presentationId: eachId, quantity: "1", type: "INTERNAL", cause: "Otro" }),
    "nota",
    "Aceptó 'Otro' sin nota",
  );
  await expectError(
    () => registerLoss({ ...ctxA, role: "CASHIER" }, { productId, presentationId: eachId, quantity: "1", type: "LOSS", cause: "Robo" }),
    "permiso",
    "Un cajero registró una merma",
  );

  // 3. Otro negocio no puede revertir ni ver el registro.
  await expectError(() => voidLoss(ctxB, loss.id, "intento"), "no encontrado", "Otro negocio revirtió la merma");
  const otherList = await listLosses(ctxB, { from: new Date("2020-01-01"), to: new Date("2100-01-01") });
  assert(!otherList.rows.some((row) => row.id === loss.id), "Otro negocio ve la merma");

  // 4. Resumen: solo los registros activos suman.
  const consumo = await registerLoss(ctxA, {
    productId,
    presentationId: eachId,
    quantity: "1",
    type: "INTERNAL",
    cause: "Otro",
    note: "Prueba de verificación",
  });
  let summary = await listLosses(ctxA, { from: new Date("2020-01-01"), to: new Date("2100-01-01") });
  assert(summary.totalCost === loss.totalCost + consumo.totalCost, "El total de mermas no suma los registros");

  // 5. Revertir devuelve el stock, marca el registro y no se puede repetir.
  await expectError(() => voidLoss({ ...ctxA, role: "WAREHOUSE" }, loss.id, "error"), "permiso", "Un almacenero revirtió una merma");
  await voidLoss(ctxA, loss.id, "Se encontró la mercadería");
  assert((await balance()) === before - 10000, "Revertir no devolvió las 2 unidades");
  const voided = await prisma.stockLoss.findUniqueOrThrow({ where: { id: loss.id } });
  assert(voided.status === "VOIDED" && voided.voidReason === "Se encontró la mercadería", "La merma no quedó revertida");
  const back = await prisma.stockMovement.findFirst({ where: { referenceId: loss.id, type: "LOSS_VOID", direction: "IN" } });
  assert(back, "La reversión no quedó en el kardex");
  await expectError(() => voidLoss(ctxA, loss.id, "otra vez"), "ya fue revertido", "Se revirtió dos veces");
  summary = await listLosses(ctxA, { from: new Date("2020-01-01"), to: new Date("2100-01-01") });
  assert(summary.totalCost === consumo.totalCost && summary.voided === 1, "El resumen sumó una merma revertida");

  // Deja el stock como estaba.
  await voidLoss(ctxA, consumo.id, "Fin de la verificación");
  assert((await balance()) === before, "El stock no volvió al valor inicial");
  console.log("Verificación de mermas y pérdidas correcta");
}
