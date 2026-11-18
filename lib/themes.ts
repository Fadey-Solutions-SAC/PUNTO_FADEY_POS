import type { CSSProperties } from "react"

export const THEMES = [
  { id: "azul", label: "Azul", panel: "#0c2340", button: "#0f5f73", accent: "#148a84", ink: "#ffffff", soft: "#cbd5e1", dim: "#94a3b8", hover: "rgba(255,255,255,0.12)", buttonInk: "#ffffff" },
  { id: "celeste", label: "Celeste", panel: "#7ed8f5", button: "#5dcee8", accent: "#0369a1", ink: "#083344", soft: "#0e4a5c", dim: "#155e75", hover: "rgba(8,51,68,0.1)", buttonInk: "#083344" },
  { id: "verde", label: "Verde claro", panel: "#b7f0c4", button: "#8ee4a8", accent: "#15803d", ink: "#052e16", soft: "#14532d", dim: "#166534", hover: "rgba(5,46,22,0.1)", buttonInk: "#052e16" },
  { id: "negro", label: "Negro", panel: "#111111", button: "#1c1c1c", accent: "#a3a3a3", ink: "#ffffff", soft: "#d4d4d4", dim: "#a3a3a3", hover: "rgba(255,255,255,0.12)", buttonInk: "#ffffff" },
  { id: "morado", label: "Morado", panel: "#4c1d6b", button: "#6d28a8", accent: "#e9d5ff", ink: "#ffffff", soft: "#e9d5ff", dim: "#d8b4fe", hover: "rgba(255,255,255,0.12)", buttonInk: "#ffffff" },
  { id: "violeta", label: "Violeta", panel: "#5b4dff", button: "#7c6bff", accent: "#ddd6fe", ink: "#ffffff", soft: "#ede9fe", dim: "#c4b5fd", hover: "rgba(255,255,255,0.14)", buttonInk: "#ffffff" },
] as const

export type ThemeId = (typeof THEMES)[number]["id"]

export function themeById(id: string | null | undefined) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

export function themeStyle(id: string | null | undefined): CSSProperties {
  const theme = themeById(id)
  return {
    "--pf-panel": theme.panel,
    "--pf-panel-ink": theme.ink,
    "--pf-panel-soft": theme.soft,
    "--pf-panel-dim": theme.dim,
    "--pf-panel-hover": theme.hover,
    "--pf-button": theme.button,
    "--pf-button-ink": theme.buttonInk,
    "--pf-accent": theme.accent,
  } as React.CSSProperties
}
