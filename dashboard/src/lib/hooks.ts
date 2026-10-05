"use client";

import useSWR from "swr";
import { api } from "./api";

const LIVE = Number(process.env.NEXT_PUBLIC_REFRESH_MS ?? 5000);

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
