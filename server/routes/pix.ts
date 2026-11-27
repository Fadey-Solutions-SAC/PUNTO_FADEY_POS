import type { Express } from "express"
import { errorMessage } from "../../lib/errors"
import { answer, ASSISTANT_NAME, checkRate, suggestionsFor } from "../../lib/pix/engine"
import { clearHistory, getHistory, pruneHistory, saveMessage } from "../../lib/pix/history"
import { requireApiTenant, type AuthedRequest } from "../tenant"

/** Asistente PIX: historial, preguntas y nueva conversación. Todo se resuelve en el servidor. */
export function registerPixRoutes(app: Express) {
  app.get("/api/pix", requireApiTenant, async (req: AuthedRequest, res) => {
    try {
      const ctx = req.tenant!
      res.json({ name: ASSISTANT_NAME, messages: await getHistory(ctx), suggestions: suggestionsFor(ctx) })
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
      const id = await saveMessage(ctx, "assistant", result.reply, { links: result.links, source: result.source })
      pruneHistory(ctx).catch(() => undefined)
      res.json({ ...result, id })
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
