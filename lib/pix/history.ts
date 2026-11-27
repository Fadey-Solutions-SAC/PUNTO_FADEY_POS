/**
 * Historial y memoria de PIX por usuario y negocio (tabla AssistantMessage).
 * - Conversación: se guardan los últimos 30 días y como máximo 200 mensajes por usuario.
 * - Memoria (role "memory"): notas que el usuario pide recordar y su meta de ventas.
 */
import { prisma } from "@/lib/db"
import type { TenantContext } from "@/lib/types"

export type StoredMessage = { id: string; role: "user" | "assistant"; content: string; sources: unknown; createdAt: string }

const KEEP_DAYS = 30
const KEEP_MAX = 200

export async function saveMessage(ctx: TenantContext, role: "user" | "assistant", content: string, sources?: unknown) {
  const row = await prisma.assistantMessage.create({
    data: { businessId: ctx.businessId, userId: ctx.userId, role, content, sourcesJson: sources ? JSON.stringify(sources) : null },
  })
  return row.id
}

export async function pruneHistory(ctx: TenantContext) {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000)
  await prisma.assistantMessage.deleteMany({ where: { businessId: ctx.businessId, userId: ctx.userId, role: { in: ["user", "assistant"] }, createdAt: { lt: cutoff } } })
  const extra = await prisma.assistantMessage.findMany({
    where: { businessId: ctx.businessId, userId: ctx.userId, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "desc" },
    skip: KEEP_MAX,
    select: { id: true },
  })
  if (extra.length) await prisma.assistantMessage.deleteMany({ where: { id: { in: extra.map((r) => r.id) } } })
}

export async function getHistory(ctx: TenantContext, limit = 60): Promise<StoredMessage[]> {
  const rows = await prisma.assistantMessage.findMany({
    where: { businessId: ctx.businessId, userId: ctx.userId, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
  })
  return rows.reverse().map((r) => {
    let sources: unknown = null
    try {
      sources = r.sourcesJson ? JSON.parse(r.sourcesJson) : null
    } catch {
      sources = null
    }
    return { id: r.id, role: r.role as "user" | "assistant", content: r.content, sources, createdAt: r.createdAt.toISOString() }
  })
}

export async function clearHistory(ctx: TenantContext) {
  await prisma.assistantMessage.deleteMany({ where: { businessId: ctx.businessId, userId: ctx.userId, role: { in: ["user", "assistant"] } } })
}

/* ───────────── Memoria ───────────── */

export type Memory = { notes: { id: string; text: string }[]; goal: { amount: number; scope: "day" | "month" } | null }

export async function recall(ctx: TenantContext): Promise<Memory> {
  const rows = await prisma.assistantMessage.findMany({
    where: { businessId: ctx.businessId, userId: ctx.userId, role: "memory" },
    orderBy: { createdAt: "asc" },
  })
  const memory: Memory = { notes: [], goal: null }
  for (const row of rows) {
    try {
      const data = JSON.parse(row.content) as { type: string; text?: string; amount?: number; scope?: "day" | "month" }
      if (data.type === "note" && data.text) memory.notes.push({ id: row.id, text: data.text })
      if (data.type === "goal" && data.amount) memory.goal = { amount: data.amount, scope: data.scope === "month" ? "month" : "day" }
    } catch {
      /* fila dañada: se ignora */
    }
  }
  return memory
}

export async function rememberNote(ctx: TenantContext, text: string) {
  const count = await prisma.assistantMessage.count({ where: { businessId: ctx.businessId, userId: ctx.userId, role: "memory" } })
  if (count >= 40) throw new Error("Ya tengo 40 notas guardadas. Pídeme «olvida todo» o borra alguna antes de agregar otra.")
  await prisma.assistantMessage.create({ data: { businessId: ctx.businessId, userId: ctx.userId, role: "memory", content: JSON.stringify({ type: "note", text }) } })
}

export async function setGoal(ctx: TenantContext, amount: number, scope: "day" | "month") {
  const rows = await prisma.assistantMessage.findMany({ where: { businessId: ctx.businessId, userId: ctx.userId, role: "memory" }, select: { id: true, content: true } })
  const old = rows.filter((r) => r.content.includes('"type":"goal"')).map((r) => r.id)
  if (old.length) await prisma.assistantMessage.deleteMany({ where: { id: { in: old } } })
  await prisma.assistantMessage.create({ data: { businessId: ctx.businessId, userId: ctx.userId, role: "memory", content: JSON.stringify({ type: "goal", amount, scope }) } })
}

export async function forgetAll(ctx: TenantContext) {
  await prisma.assistantMessage.deleteMany({ where: { businessId: ctx.businessId, userId: ctx.userId, role: "memory" } })
}

export async function forgetMatching(ctx: TenantContext, words: string[]) {
  const memory = await recall(ctx)
  const ids = memory.notes.filter((n) => words.every((w) => n.text.toLowerCase().includes(w.toLowerCase()))).map((n) => n.id)
  if (ids.length) await prisma.assistantMessage.deleteMany({ where: { id: { in: ids } } })
  return ids.length
}
