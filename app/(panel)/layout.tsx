import { AppShell } from "@/components/shell";
import { readTheme } from "@/lib/appearance";
import { brandLogoUrl } from "@/lib/cover";
import { navigation } from "@/lib/nav";
import { APP_VERSION, listNotices } from "@/lib/notices";
import { requireTenant } from "@/lib/tenant";

export const instant = false;

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  const [notices, theme, logo] = await Promise.all([listNotices(ctx), readTheme(ctx.businessId), brandLogoUrl()]);
  return (
    <AppShell
      nav={navigation(ctx.role, ctx.grants)}
      notices={notices}
      version={APP_VERSION}
      theme={theme}
      logo={logo}
      user={{
        name: ctx.userName,
        role: ctx.role,
        detail: ctx.configMode ? "Modo configuración" : undefined,
      }}
    >
      {children}
    </AppShell>
  );
}
