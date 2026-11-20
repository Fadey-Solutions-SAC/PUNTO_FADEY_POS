import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { App } from "./App"
import "./index.css"
import { SplashGate } from "./splash/SplashGate"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SplashGate>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SplashGate>
  </StrictMode>,
)

// PWA: el service worker hace la app instalable y muestra un aviso sin conexión.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined)
  })
}
