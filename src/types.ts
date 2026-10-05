import type { BaseMessage } from "@langchain/core/messages";

/** A document retrieved from the knowledge base or long-term memory. */
export interface RetrievedDoc {
  id: string | number;
  source: "knowledge" | "memory";
  title: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export type LeadSegment = "nurture" | "objection" | "closing";

export interface ScoreBreakdown {
  /** Deterministic, rules-based portion of the score. */
  heuristic: number;
  /** LLM-assessed portion of the score. */
  model: number;
  factors: Array<{ label: string; weight: number; note?: string }>;
  rationale: string;
}

export type Intent =
  | "greeting"
  | "question"
  | "pricing"
  | "objection"
  | "interested"
  | "ready_to_buy"
  | "booking"
  | "smalltalk"
  | "unknown";

export interface TriageResult {
  isBot: boolean;
  botReason: string | null;
  intent: Intent;
  language: string;
  sentiment: "positive" | "neutral" | "negative";
  urgency: "low" | "medium" | "high";
  summary: string;
}

export interface StrategyResult {
  segment: LeadSegment;
  approach: string;
  tone: string;
  keyPoints: string[];
  objectionType: string | null;
  cta: string;
  playbook: string[];
}

export interface BookingInfo {
  intent: boolean;
  status: "none" | "proposed" | "confirmed";
  scheduledAt: string | null;
  details: Record<string, unknown>;
  followUpAt: string | null;
}

export interface Evaluation {
  relevance: number; // 0-10
  groundedness: number; // 0-10, is the answer supported by context
  tone: number; // 0-10
  conversionLikelihood: number; // 0-10
  overall: number; // 0-10
  strengths: string[];
  improvements: string[];
  critique: string;
}

export interface Reflection {
  lesson: string;
  whatWorked: string[];
  whatToImprove: string[];
  /** Actionable guidance stored in long-term memory for future turns. */
  guidance: string;
  importance: number; // 0-1
}

export interface TraceEntry {
  node: string;
  at: string;
  detail?: Record<string, unknown>;
}

export interface LeadRecord {
  id: string;
  waJid: string;
  name: string | null;
  stage: string;
  score: number;
  segment: LeadSegment | null;
  firstSeen: string;
  lastSeen: string;
  meta: Record<string, unknown>;
  /** "inbound" = wrote to us; "prospect" = imported for outbound outreach. */
  kind: "inbound" | "prospect";
  company: string | null;
  source: string | null;
  notes: string | null;
  outreachStatus: string;
  outreachAttempts: number;
  lastOutreachAt: string | null;
  nextFollowUpAt: string | null;
  optOut: boolean;
}

/** Payload entering the graph for a single inbound WhatsApp message. */
export interface InboundTurn {
  threadId: string;
  leadId: string | null;
  waJid: string;
  contactName?: string | null;
  text: string;
  messageId?: string | null;
  receivedAt?: string;
}

/** Result of the Cal.com scheduling step (availability lookup / booking). */
export interface CalBooking {
  action: "booked" | "slots" | "need_info" | "none";
  uid: string | null;
  start: string | null;
  meetingUrl: string | null;
  status: string | null;
  /** Qualification data still required before a booking can be created. */
  missing: string[];
  note: string;
}

export type { BaseMessage };
