"use client";

import useSWR from "swr";
import { api } from "./api";

const LIVE = Number(process.env.NEXT_PUBLIC_REFRESH_MS ?? 5000);
export function useBusinessBoard() {
  return useSWR("business-board", api.businessBoard, { refreshInterval: LIVE, keepPreviousData: true });
}

export function useHealth() {
  return useSWR("health", api.health, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });
}

export function useMetrics() {
  return useSWR("metrics", api.metrics, { refreshInterval: LIVE, keepPreviousData: true });
}

export function useLeads() {
  return useSWR("leads", api.leads, { refreshInterval: LIVE, keepPreviousData: true });
}

export function useLead(id: string | undefined) {
  return useSWR(id ? ["lead", id] : null, () => api.lead(id as string), {
    refreshInterval: LIVE,
    keepPreviousData: true,
  });
}

export function useEvaluations(limit = 50) {
  return useSWR(["evaluations", limit], () => api.evaluations(limit), {
    refreshInterval: 10_000,
    keepPreviousData: true,
  });
}

export function useBookings(limit = 50) {
  return useSWR(["bookings", limit], () => api.bookings(limit), {
    refreshInterval: 10_000,
    keepPreviousData: true,
  });
}

/* Pipeline & agent baru */
export function usePipelineSnapshot() {
  return useSWR("pipeline-snapshot", api.pipelineSnapshot, {
    refreshInterval: LIVE,
    keepPreviousData: true,
  });
}

export function useJobs(limit = 50, agent?: string) {
  return useSWR(["jobs", limit, agent ?? "all"], () => api.jobs(limit, agent), {
    refreshInterval: LIVE,
    keepPreviousData: !agent,
  });
}

export function useEvents(limit = 80, agent?: string) {
  return useSWR(["events", limit, agent ?? "all"], () => api.events(limit, agent), {
    refreshInterval: LIVE,
    keepPreviousData: !agent,
  });
}

export function useProjects() {
  return useSWR("projects", api.projects, { refreshInterval: LIVE, keepPreviousData: true });
}

export function useProject(id: string) {
  return useSWR(["project", id], () => api.project(id), { refreshInterval: LIVE });
}

export function useInvoices() {
  return useSWR("invoices", api.invoices, {
    refreshInterval: 10_000,
    keepPreviousData: true,
  });
}

export function useTickets() {
  return useSWR("tickets", api.tickets, { refreshInterval: LIVE, keepPreviousData: true });
}

export function useApprovals(status?: string) {
  return useSWR(["approvals", status ?? "all"], () => api.approvals(status), {
    refreshInterval: LIVE,
    keepPreviousData: true,
  });
}

export function useKnowledge() {
  return useSWR("knowledge", api.knowledge, {
    refreshInterval: 15_000,
    keepPreviousData: true,
  });
}

export function useKnowledgeDoc(id: string | null) {
  return useSWR(id ? ["knowledge-doc", id] : null, () => api.knowledgeDoc(id!), {
    revalidateOnFocus: false,
  });
}

export function useGrowth(days = 14) {
  return useSWR(["growth", days], () => api.growth(days), {
    refreshInterval: 15_000,
    keepPreviousData: true,
  });
}

export function useImprovements(status?: string) {
  return useSWR(["improvements", status ?? "all"], () => api.improvements(status), {
    refreshInterval: 15_000,
    keepPreviousData: true,
  });
}

export function useSupervisorProfile() {
  return useSWR("supervisor-profile", api.supervisorProfile, { revalidateOnFocus: false });
}

export function useSupervisorChat() {
  return useSWR("supervisor-chat", api.supervisorChat, {
    refreshInterval: 10_000,
    keepPreviousData: true,
  });
}

/* Agent registry & status */
export function useAgents() {
  return useSWR("agents", api.agents, { revalidateOnFocus: true });
}

export function useAgentStatus() {
  return useSWR("agents-status", api.agentsStatus, {
    refreshInterval: LIVE,
    keepPreviousData: true,
  });
}
