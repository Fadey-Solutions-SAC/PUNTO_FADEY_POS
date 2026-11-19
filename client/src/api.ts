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
