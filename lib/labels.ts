export const MOVE_LABEL: Record<string, string> = {
  PURCHASE: "Compra recibida",
  ENTRY: "Ingreso",
  RETURN: "Devolución",
  SALE: "Venta",
  SALE_VOID: "Anulación",
  ADJUST: "Ajuste",
  TRANSFER_OUT: "Salida por transferencia",
  TRANSFER_IN: "Entrada por transferencia",
  SHRINKAGE: "Merma",
  LOSS: "Pérdida",
  INTERNAL: "Consumo interno",
  LOSS_VOID: "Reversión de merma",
}

export const PAYMENT_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
  CREDIT: "Crédito",
}

export const CASH_LABEL: Record<string, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Egreso",
  WITHDRAWAL: "Retiro",
  DEPOSIT: "Depósito",
}

export const TRANSFER_LABEL: Record<string, string> = {
  SENT: "En tránsito",
  RECEIVED: "Recibida",
  CANCELLED: "Anulada",
}

export const PURCHASE_LABEL: Record<string, string> = {
  ORDERED: "Pendiente de recepción",
  PARTIAL: "Recepción parcial",
  RECEIVED: "Recibida",
  CANCELLED: "Anulada",
}

export const DOC_LABEL: Record<string, string> = {
  FACTURA: "Factura",
  BOLETA: "Boleta",
  NOTA_CREDITO: "Nota de crédito",
  NOTA_DEBITO: "Nota de débito",
  QUEUED: "En cola",
  SENT: "Enviado",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
  ERROR: "Error de envío",
  OBSERVED: "Observado",
}
