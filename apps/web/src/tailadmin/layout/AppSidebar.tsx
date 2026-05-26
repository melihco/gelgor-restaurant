"use client";

import React from "react";
import {
  Activity,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckSquare,
  CreditCard,
  FileText,
  Gauge,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Palette,
  PenTool,
  SearchCode,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useDashboardSnapshot } from "@/hooks/use-dashboard-snapshot";
import { cn } from "@/lib/utils";
import { useNavigationStore, type AppPage } from "@/stores/navigation-store";
import { useSidebar } from "../context/SidebarContext";

type NavItem = {
  id: AppPage;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  accent?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Command",
    items: [
      { id: "dashboard", label: "Executive Dashboard", icon: LayoutDashboard, accent: "#22d3ee" },
      { id: "agents", label: "AI Agents Office", icon: Bot, accent: "#a78bfa" },
      { id: "approvals", label: "Approvals", icon: CheckSquare, accent: "#f59e0b" },
      { id: "executions", label: "Execution Center", icon: Activity, accent: "#34d399" },
    ],
  },
  {
    label: "Growth",
    items: [
      { id: "content", label: "Content Studio", icon: PenTool, accent: "#f472b6" },
      { id: "brand", label: "Brand Hub", icon: Palette, accent: "#818cf8" },
      { id: "reviews", label: "Review Management", icon: MessageSquare, accent: "#fb7185" },
      { id: "ads", label: "Google Ads", icon: BarChart3, accent: "#fbbf24" },
      { id: "visitors", label: "Analytics", icon: Gauge, accent: "#60a5fa" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "outputs", label: "Artifact Center", icon: FileText, accent: "#818cf8" },
      { id: "reports", label: "Customer Reports", icon: BrainCircuit, accent: "#22d3ee" },
      { id: "seo", label: "SEO Intelligence", icon: SearchCode, accent: "#34d399" },
    ],
  },
  {
    label: "System",
    items: [
      { id: "setup", label: "Integrations", icon: Link2, accent: "#a78bfa" },
      { id: "billing", label: "Billing & Usage", icon: CreditCard, accent: "#f59e0b" },
      { id: "readiness", label: "Live Readiness", icon: ShieldCheck, accent: "#34d399" },
      { id: "settings", label: "Settings", icon: Settings, accent: "#71717a" },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleMobileSidebar } = useSidebar();
  const currentPage = useNavigationStore((s) => s.currentPage);
  const navigate = useNavigationStore((s) => s.navigate);
  const { data } = useDashboardSnapshot();

  const pendingApprovals = data?.pendingArtifacts?.length ?? 0;
  const workingAgents = data?.agents?.filter((a) => a.state === "working").length ?? 0;
  const blockedAgents = data?.agents?.filter((a) => a.state === "blocked" || a.state === "error").length ?? 0;
  const totalAgents = data?.agents?.length ?? 0;

  const wide = isExpanded || isHovered || isMobileOpen;

  function badgeFor(id: AppPage): number | undefined {
    if (id === "agents") return workingAgents || undefined;
    if (id === "approvals") return pendingApprovals || undefined;
    if (id === "executions") return blockedAgents || undefined;
    return undefined;
  }

  function handleNavigate(page: AppPage) {
    navigate(page);
    if (isMobileOpen) toggleMobileSidebar();
  }

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col overflow-x-hidden transition-all duration-300 ease-in-out",
        "lg:relative lg:inset-auto lg:z-0 lg:min-h-0 lg:h-full lg:w-full lg:max-w-none lg:translate-x-0",
        isMobileOpen ? "translate-x-0 max-lg:w-[260px]" : "-translate-x-full lg:translate-x-0 max-lg:w-[72px]",
      )}
      style={{
        background: "linear-gradient(180deg, #090b12 0%, #07080f 100%)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo / Brand */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-5 shrink-0",
          !wide && "lg:justify-center",
        )}
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <button
          type="button"
          onClick={() => handleNavigate("dashboard")}
          className="flex items-center gap-3 min-w-0"
        >
          <div
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
              boxShadow: "0 0 20px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          {wide && (
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold text-white tracking-[-0.02em] truncate">SmartAgency</p>
              <p className="text-[10px] text-slate-500 tracking-wide truncate">AI Operating System</p>
            </div>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-4 no-scrollbar">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && "mt-5")}>
            {wide ? (
              <p className="mb-1.5 px-2 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">
                {group.label}
              </p>
            ) : (
              <div className="mb-1.5 mx-auto h-px bg-slate-800/70 w-8" />
            )}

            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = currentPage === item.id;
                const badge = badgeFor(item.id);
                const Icon = item.icon;

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleNavigate(item.id)}
                      title={!wide ? item.label : undefined}
                      className={cn(
                        "nav-sweep group relative flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-all duration-150",
                        !wide && "lg:justify-center",
                        active
                          ? "nav-active-glow"
                          : "hover:bg-white/[0.04]",
                      )}
                      style={active ? {
                        background: `linear-gradient(135deg, ${item.accent ?? "#6366f1"}18, ${item.accent ?? "#6366f1"}08)`,
                        boxShadow: `inset 0 0 0 1px ${item.accent ?? "#6366f1"}30`,
                      } : {}}
                    >
                      {/* Active left bar */}
                      {active && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full"
                          style={{ background: item.accent ?? "#6366f1" }}
                        />
                      )}

                      {/* Icon */}
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
                          active ? "opacity-100" : "opacity-50 group-hover:opacity-80",
                          !wide && "h-9 w-9",
                        )}
                      >
                        <Icon
                          className="h-4 w-4"
                          color={active ? (item.accent ?? "#818cf8") : "#94a3b8"}
                        />
                      </span>

                      {/* Label + badge */}
                      {wide && (
                        <>
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-[13px] font-medium",
                              active ? "text-white" : "text-slate-400 group-hover:text-slate-200",
                            )}
                          >
                            {item.label}
                          </span>
                          {badge ? (
                            <span
                              className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-bold"
                              style={{
                                background: item.accent ? `${item.accent}22` : "rgba(99,102,241,0.2)",
                                color: item.accent ?? "#818cf8",
                                border: `1px solid ${item.accent ?? "#818cf8"}30`,
                              }}
                            >
                              {badge}
                            </span>
                          ) : null}
                        </>
                      )}

                      {/* Collapsed badge dot */}
                      {!wide && badge ? (
                        <span
                          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                          style={{ background: item.accent ?? "#f59e0b" }}
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer — system status */}
      <div
        className="shrink-0 px-2.5 py-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        {wide ? (
          <div
            className="rounded-xl px-3 py-2.5"
            style={{
              background: "rgba(34,197,94,0.06)",
              border: "1px solid rgba(34,197,94,0.14)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <p className="text-[11px] font-semibold text-emerald-400">System Online</p>
            </div>
            <p className="mt-1 text-[10px] text-emerald-600 leading-4">
              {workingAgents} active · {totalAgents} agents deployed
            </p>
          </div>
        ) : (
          <div className="flex justify-center">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
