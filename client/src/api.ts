export type ApiError = { error: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  const data = (await res.json().catch(() => ({}))) as T & ApiError
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`)
  }
  return data
}

export function getBootstrap() {
  return request<{ needsSetup: boolean; version: string }>("/api/auth/bootstrap")
}

export function getMe() {
  return request<{
    user: { id: string; name: string; email: string; role: string; configMode: boolean }
    business: { id: string; name: string; currency: string }
    branchId: string
    warehouseId: string
  }>("/api/auth/me")
}

export function login(username: string, password: string) {
  return request<{ ok: true; configMode: boolean }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
}

export function logout() {
  return request<{ ok: true }>("/api/auth/logout", { method: "POST" })
}

export function getVersion() {
  return request<{ version: string; label: string; nextStillPrimary?: boolean }>("/api/version")
}

export type PanelBootstrap = {
  user: { id: string; name: string; role: string; configMode: boolean }
  business: { id: string; name: string; currency: string }
  branch: { id: string; name: string }
  warehouse: { id: string; name: string }
  nav: { title: string; items: { href: string; label: string }[] }[]
  permissions: { cash: boolean; cashClose: boolean; sell: boolean }
}

export function getPanelBootstrap() {
  return request<PanelBootstrap>("/api/panel/bootstrap")
}

export type MoneyOut = { cents: number; label: string; amount: string }

export type CashStatus = {
  currency: string
  assignedRegisterId: string | null
  registers: { id: string; name: string }[]
  session: null | {
    id: string
    registerName: string
    openedAt: string
    opening: MoneyOut
    expected: MoneyOut | null
    byMethod: Record<string, MoneyOut>
    income: MoneyOut | null
    expense: MoneyOut | null
    movements: {
      id: string
      type: string
      typeLabel: string
      reason: string
      createdAt: string
      createdAtLabel: string
      amount: MoneyOut
    }[]
  }
}

export function getCashStatus() {
  return request<CashStatus>("/api/cash/status")
}

export function openCash(cashRegisterId: string, openingAmount: string) {
  return request<{ ok: true; sessionId: string }>("/api/cash/open", {
    method: "POST",
    body: JSON.stringify({ cashRegisterId, openingAmount }),
  })
}

export function addCashMovement(type: string, amount: string, reason: string) {
  return request<{ ok: true; movementId: string }>("/api/cash/movement", {
    method: "POST",
    body: JSON.stringify({ type, amount, reason }),
  })
}

export function getCashHistory() {
  return request<{
    currency: string
    sessions: {
      id: string
      status: string
      registerName: string
      userName: string
      branchName: string
      openedAtLabel: string
      opening: MoneyOut
      expected: MoneyOut | null
      counted: MoneyOut | null
      difference: MoneyOut | null
    }[]
  }>("/api/cash/history")
}
