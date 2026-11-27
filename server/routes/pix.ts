import express, { type Express } from "express"
import { errorMessage } from "../../lib/errors"
import { cancelAction, isPending, previewFile, runAction } from "../../lib/pix/actions"
import { answer, ASSISTANT_NAME, checkRate, suggestionsFor } from "../../lib/pix/engine"
import { clearHistory, getHistory, pruneHistory, saveMessage } from "../../lib/pix/history"
import { requireApiTenant, type AuthedRequest } from "../tenant"

/** Asistente PIX: historial, preguntas, archivos (plantillas) y acciones con confirmación. Todo se resuelve en el servidor. */
export function registerPixRoutes(app: Express) {
  app.get("/api/pix", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const messages = (await getHistory(ctx)).map((message) => {
        // El botón «Aplicar» solo sigue activo si la acción aún está pendiente.
        const sources = message.sources as { action?: { id: string } } | null
        if (sources?.action && !isPending(sources.action.id)) return { ...message, sources: { ...sources, action: undefined } }
        return message
      })
      res.json({ name: ASSISTANT_NAME, messages, suggestions: suggestionsFor(ctx) })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/pix/chat", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const message = String(req.body?.message ?? "").trim()
      if (!message) {
        res.status(400).json({ error: "Escribe una pregunta." })
        return
      }
      if (!checkRate(ctx.userId)) {
        res.status(429).json({ error: "Demasiadas preguntas seguidas. Espera un minuto." })
        return
      }
      await saveMessage(ctx, "user", message.slice(0, 600))
      let result
      try {
        result = await answer(ctx, message)
      } catch (error) {
        console.error("[pix]", errorMessage(error))
        result = { reply: "Tuve un problema al consultar eso. Intenta de nuevo o pregunta de otra forma.", links: [], suggestions: [], source: "error" }
      }
      const id = await saveMessage(ctx, "assistant", result.reply, { links: result.links, source: result.source, action: result.action })
      pruneHistory(ctx).catch(() => undefined)
      res.json({ ...result, id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  // Archivo subido al chat (plantilla de productos o de stock): PIX muestra la vista previa y deja el cambio pendiente.
  app.post("/api/pix/file", requireApiTenant, express.raw({ type: () => true, limit: "8mb" }), async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const file = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      const name = decodeURIComponent(String(req.query.name ?? "archivo.xlsx")).slice(0, 120)
      if (!file.length) throw new Error("El archivo está vacío.")
      await saveMessage(ctx, "user", `📎 ${name}`)
      let result
      try {
        result = await previewFile(ctx, file, name)
      } catch (error) {
        result = { reply: `No pude usar ese archivo: ${errorMessage(error)}`, links: [], source: "file_error" }
      }
      const id = await saveMessage(ctx, "assistant", result.reply, { links: result.links, source: result.source, action: result.action })
      res.json({ ...result, suggestions: [], id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.post("/api/pix/action/:id", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      const cancel = req.body?.cancel === true
      await saveMessage(ctx, "user", cancel ? "Cancelar" : "Aplicar cambios")
      let result
      try {
        result = cancel ? cancelAction(ctx, req.params.id) : await runAction(ctx, req.params.id)
      } catch (error) {
        result = { reply: `No se pudo aplicar: ${errorMessage(error)}`, links: [], source: "action_error" }
      }
      const id = await saveMessage(ctx, "assistant", result.reply, { links: result.links, source: result.source })
      res.json({ ...result, suggestions: [], id })
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) })
    }
  })

  app.delete("/api/pix", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      await clearHistory(req.tenant!)
      res.json({ ok: true })
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) })
    }
  })
}
