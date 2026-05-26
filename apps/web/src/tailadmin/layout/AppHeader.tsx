"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronDown,
  Command,
  LogOut,
  Plus,
  Radio,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { useDashboardSnapshot } from "@/hooks/use-dashboard-snapshot";
import { apiClient } from "@/lib/api-client";
import { logoutFromBrowser } from "@/lib/browser-logout";
import { useInteractionStore } from "@/stores/interaction-store";
import { useNotificationStore } from "@/stores/notification-store";
import { trPageTitle } from "@/lib/i18n/tr-shell";
import { useNavigationStore } from "@/stores/navigation-store";
import { useSidebar } from "../context/SidebarContext";
import { cn } from "@/lib/utils";

const AppHeader: React.FC = () => {
  const [isUserMenuOpen, setUserMenuOpen] = useState(false);
  const [isNotificationOpen, setNotificationOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { toggleSidebar, toggleMobileSidebar } = useSidebar();
  const currentPage = useNavigationStore((state) => state.currentPage);
  const navigate = useNavigationStore((state) => state.navigate);
  const openAssignModal = useInteractionStore((state) => state.openAssignModal);
  const notifications = useNotificationStore((state) => state.notifications);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const { data } = useDashboardSnapshot();
  const { data: security } = useQuery({
    queryKey: ["current-user-security"],
    queryFn: () => apiClient.getCurrentUserSecurity(),
    staleTime: 60_000,
  });

  const agents = data?.agents ?? [];
  const briefAgent = agents.find((a) => a.backendAgentType === "AiCeo") ?? agents[0];
  const workingCount = agents.filter((a) => a.state === "working").length;
  const pendingCount = data?.pendingArtifacts?.length ?? 0;
  const blockedCount = agents.filter((a) => a.state === "blocked" || a.state === "error").length;
  const page = trPageTitle(currentPage);
  const bellBadgeCount = Math.min(99, unreadCount + pendingCount);

  const handleToggle = () => {
    if (window.innerWidth >= 1024) toggleSidebar();
    else toggleMobileSidebar();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!isNotificationOpen) return;
    const close = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node))
        setNotificationOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [isNotificationOpen]);

  const logoutMutation = useMutation({
    mutationFn: () => logoutFromBrowser(),
    onSettled: () => {
      setUserMenuOpen(false);
      void queryClient.clear();
      // Force full navigation so the app remounts and skips any cached security state
      window.location.href = '/?loggedout=1';
    },
  });

  return (
    <header
      className="sticky top-0 z-30 flex w-full shrink-0 items-center"
      style={{
        background: "rgba(7,8,15,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        height: "60px",
      }}
    >
      <div className="flex w-full items-center gap-3 px-4 lg:px-5">
        {/* Sidebar toggle */}
        <button
          type="button"
          onClick={handleToggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
        >
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z"
              fill="currentColor"
            />
          </svg>
        </button>

        {/* Page title (desktop) */}
        <div className="hidden min-w-0 lg:block">
          <p className="text-[13px] font-semibold text-white/90 tracking-[-0.01em] truncate">{page.title}</p>
        </div>

        {/* Divider */}
        <div className="hidden h-4 w-px bg-white/10 lg:block" />

        {/* Command search */}
        <div className="hidden flex-1 max-w-md lg:block">
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            onClick={() => inputRef.current?.focus()}
          >
            <Search className="h-3.5 w-3.5 text-slate-600 shrink-0" />
            <span className="flex-1 text-slate-600 text-[12px]">Search agents, artifacts, approvals…</span>
            <span
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-600 shrink-0"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <Command className="h-2.5 w-2.5" /> K
            </span>
          </button>
        </div>

        {/* Right section */}
        <div className="ml-auto flex items-center gap-2">
          {/* Live status pills */}
          {workingCount > 0 && (
            <div
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 xl:flex"
              style={{
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.16)",
              }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[11px] font-semibold text-emerald-400">{workingCount} live</span>
            </div>
          )}

          {blockedCount > 0 && (
            <div
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 xl:flex"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.16)",
              }}
            >
              <ShieldAlert className="h-3 w-3 text-red-400" />
              <span className="text-[11px] font-semibold text-red-400">{blockedCount} blocked</span>
            </div>
          )}

          {/* New Brief */}
          <button
            type="button"
            onClick={() => briefAgent && openAssignModal(briefAgent.apiId)}
            disabled={!briefAgent}
            className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition xl:flex disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
              boxShadow: "0 0 12px rgba(99,102,241,0.25)",
            }}
          >
            <Zap className="h-3.5 w-3.5" />
            New Brief
          </button>

          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setNotificationOpen((o) => !o)}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
            >
              <Bell className="h-4 w-4" />
              {bellBadgeCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
                  style={{ background: "#ef4444" }}
                >
                  {bellBadgeCount}
                </span>
              )}
            </button>

            {isNotificationOpen && (
              <div
                className="absolute right-0 z-[60] mt-2 flex w-80 max-h-96 flex-col overflow-hidden rounded-xl"
                style={{
                  background: "rgba(13,14,22,0.97)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
                  backdropFilter: "blur(24px)",
                }}
                role="menu"
              >
                <div
                  className="flex shrink-0 items-center justify-between px-4 py-3"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <h2 className="text-[13px] font-semibold text-white/90">Notifications</h2>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300"
                      onClick={() => markAllRead()}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {pendingCount > 0 && (
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                      onClick={() => { setNotificationOpen(false); navigate("outputs"); }}
                    >
                      <span className="text-[13px] font-medium text-white/90">Pending approvals</span>
                      <span className="text-[11px] text-slate-500">{pendingCount} outputs awaiting review</span>
                    </button>
                  )}
                  {notifications.length === 0 && pendingCount === 0 && (
                    <p className="px-4 py-8 text-center text-[13px] text-slate-600">No notifications yet</p>
                  )}
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={cn(
                        "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition hover:bg-white/[0.04]",
                        !n.read && "bg-indigo-500/[0.04]",
                      )}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                      onClick={() => { if (!n.read) markRead(n.id); }}
                    >
                      <span className="text-[13px] font-medium text-white/90">{n.title}</span>
                      <span className="line-clamp-2 text-[11px] text-slate-500">{n.message}</span>
                      <span className="text-[10px] text-slate-600">
                        {new Date(n.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.05]"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
              >
                {(security?.displayName || "S")[0]?.toUpperCase()}
              </span>
              <span className="hidden text-left md:block">
                <span className="block text-[12px] font-semibold text-white/90 leading-tight">
                  {security?.displayName ?? "SmartAgency"}
                </span>
                <span className="block text-[10px] text-slate-500">{security?.role ?? "Operator"}</span>
              </span>
              <ChevronDown
                className={cn(
                  "hidden h-3.5 w-3.5 text-slate-600 transition-transform md:block",
                  isUserMenuOpen && "rotate-180",
                )}
              />
            </button>

            {isUserMenuOpen && (
              <div
                className="absolute right-0 z-[60] mt-1.5 min-w-[14rem] rounded-xl overflow-hidden"
                style={{
                  background: "rgba(13,14,22,0.97)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
                  backdropFilter: "blur(24px)",
                }}
                role="menu"
              >
                {security?.email && (
                  <div
                    className="px-4 py-3"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <p className="truncate text-[11px] text-slate-500">{security.email}</p>
                    {security.tenantName && (
                      <p className="mt-0.5 truncate text-[12px] font-semibold text-white/90">{security.tenantName}</p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                  onClick={() => { setUserMenuOpen(false); navigate("settings"); }}
                >
                  <Settings className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                  Settings
                </button>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "4px 0" }} />
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-indigo-400 transition hover:bg-indigo-500/10 hover:text-indigo-300"
                  onClick={() => { setUserMenuOpen(false); window.location.href = '/?register=1'; }}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  Create new workspace
                </button>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "4px 0" }} />
                <button
                  type="button"
                  role="menuitem"
                  disabled={logoutMutation.isPending}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                  onClick={() => logoutMutation.mutate()}
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" />
                  {logoutMutation.isPending ? "Signing out…" : "Sign out"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
