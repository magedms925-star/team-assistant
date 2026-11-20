import { Link, useRouterState } from "@tanstack/react-router";
import { Brain, ChevronLeft, FolderOpen, Link2, MessageSquare, Shapes } from "lucide-react";
import type { ReactNode } from "react";
import { ThemePreferenceRadio } from "@/client/components/ThemePreferenceMenuItems";

/**
 * The frame every page sits in: a bar with the way back to the Gateway and
 * the theme pick, then one scrolling column. The document itself doesn't
 * scroll (src/client/styles/app.css); the column does. A page starts with a
 * `PageHeader`. An app with more than one page puts its tabs or links in
 * `nav`.
 */
export function AppShell({
  wide = false,
  children,
}: {
  /** A wider column, for a page with a side panel. */
  wide?: boolean;
  children: ReactNode;
}) {
  // From the root route's loader (src/serverFunctions/gateway.ts).
  const gatewayUrl = useRouterState({
    select: (state) => {
      const root = state.matches[0]?.loaderData;
      return root && "gatewayUrl" in root ? root.gatewayUrl : null;
    },
  });
  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-border">
        <div
          className={`${wide ? WIDE_COLUMN : COLUMN} flex h-12 items-center justify-between gap-3`}
        >
          <div className="flex min-w-0 items-center gap-4">
            {gatewayUrl ? (
              <a
                href={gatewayUrl}
                className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-4" aria-hidden />
                All apps
              </a>
            ) : null}
            <AppNav />
          </div>
          <ThemePreferenceRadio />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main
          className={`${wide ? WIDE_COLUMN : COLUMN} space-y-8 pt-8 pb-24 md:pt-10`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

const NAV = [
  { to: "/", label: "Chats", icon: MessageSquare, exact: true },
  { to: "/projects", label: "Projects", icon: FolderOpen, exact: false },
  { to: "/artifacts", label: "Artifacts", icon: Shapes, exact: false },
  { to: "/memory", label: "Memory", icon: Brain, exact: false },
  { to: "/shares", label: "Links", icon: Link2, exact: false },
] as const;

/** The app's pages: icons alone on a phone, with labels from `sm` up. */
function AppNav() {
  return (
    <nav className="flex min-w-0 items-center gap-1">
      {NAV.map(({ to, label, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact }}
          aria-label={label}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
        >
          <Icon className="size-4" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** The column the bar and the page share. */
const COLUMN = "mx-auto w-full max-w-4xl px-4 md:px-10";
const WIDE_COLUMN = "mx-auto w-full max-w-7xl px-4 md:px-8";
