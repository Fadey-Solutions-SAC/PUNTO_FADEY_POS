"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { unstable_rethrow } from "next/navigation"
import { errorMessage } from "@/lib/errors"
import { assertAttempts, assertNoCode, clearAttempts, configPasswordOk, noteAttempt } from "@/lib/guard"
import { prisma } from "@/lib/db"
import { readSession, clearSession, signSession } from "@/lib/session"
import { authenticate, openConfigSession, provisionBusiness, registerOwner } from "@/lib/setup"

export async function loginAction(_prev: { error: string }, formData: FormData) {
  try {
    const username = String(formData.get("username") ?? formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")
    if (!username && !password) return { error: "Usuario y contraseña requerida" }
    if (!username && password) {
      assertNoCode(password)
      await assertAttempts("config", 6, 10 * 60 * 1000)
      if (!configPasswordOk(password)) {
        await noteAttempt("config", 10 * 60 * 1000)
        return { error: "Contraseña incorrecta" }
      }
      await clearAttempts("config")
      await signSession(await openConfigSession())
      redirect("/")
    }
    if (!password) return { error: "Usuario y contraseña requerida" }
    await assertAttempts("login", 8, 10 * 60 * 1000)
    const session = await authenticate(username, password)
    await clearAttempts("login")
    await signSession(session)
  } catch (error) {
    await noteAttempt("login", 10 * 60 * 1000).catch(() => undefined)
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
  redirect("/")
}

export async function configLoginAction(_prev: { error: string }, formData: FormData) {
  try {
    const password = String(formData.get("password") ?? "")
    assertNoCode(password)
    await assertAttempts("config", 6, 10 * 60 * 1000)
    if (!configPasswordOk(password)) {
      await noteAttempt("config", 10 * 60 * 1000)
      return { error: "Contraseña incorrecta" }
    }
    await clearAttempts("config")
    await signSession(await openConfigSession())
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
  redirect("/")
}

export async function setupAction(_prev: { error: string }, formData: FormData) {
  try {
    if ((await prisma.user.count()) > 0) return { error: "El sistema ya tiene un administrador" }
    const created = await registerOwner({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      businessName: String(formData.get("businessName") ?? ""),
      branchName: String(formData.get("branchName") ?? ""),
    })
    await signSession({
      userId: created.user.id,
      name: created.user.name,
      email: created.user.email,
      businessId: created.businessId,
      branchId: created.branchId,
      warehouseId: created.warehouseId,
    })
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
  redirect("/")
}

export async function logoutAction() {
  await clearSession()
  redirect("/login")
}

export async function switchContextAction(formData: FormData) {
  const session = await readSession()
  if (!session) redirect("/login")
  const businessId = String(formData.get("businessId") ?? "")
  const branchId = String(formData.get("branchId") ?? "")
  const warehouseId = String(formData.get("warehouseId") ?? "")
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: session.userId, businessId } },
  })
  if (!membership) return
  const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId, isActive: true } })
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, businessId, branchId, isActive: true },
  })
  if (!branch || !warehouse) return
  await signSession({ ...session, businessId, branchId, warehouseId })
  revalidatePath("/", "layout")
  redirect("/")
}

export async function createBusinessAction(_prev: { error: string }, formData: FormData) {
  const session = await readSession()
  if (!session) redirect("/login")
  try {
    const place = await provisionBusiness(session.userId, {
      businessName: String(formData.get("businessName") ?? ""),
      branchName: String(formData.get("branchName") ?? "Principal"),
    })
    await signSession({
      ...session,
      businessId: place.businessId,
      branchId: place.branchId,
      warehouseId: place.warehouseId,
    })
  } catch (error) {
    unstable_rethrow(error)
    return { error: errorMessage(error) }
  }
  redirect("/")
}
