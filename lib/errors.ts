export class AppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AppError"
  }
}

export function errorMessage(error: unknown) {
  if (error instanceof AppError) return error.message
  return "No se pudo completar la operación"
}
