/** Tipe untuk Agent Scoper & PRD Builder (F2 · Deal Desk).
 *
 * Struktur mengikuti praktik "PRD siap AI-prototyping": overview, goals,
 * scope, JTBD, user stories, experience, components, data model, API surface,
 * state, tech stack, file structure, acceptance criteria, risks, rollout.
 */

export interface PrdRequirement {
  title: string;
  description: string;
  priority: "must" | "should" | "could";
}

export interface PrdFlow {
  name: string;
  steps: string[];
}

export interface PrdIntegration {
  name: string;
  /** webhook | REST | database | email | whatsapp | payment | lain-lain. */
  type: string;
  /** inbound | outbound | both. */
  direction: string;
  purpose: string;
}

export interface PrdField {
  name: string;
  type: string;
  note?: string;
}

export interface PrdTable {
  table: string;
  fields: PrdField[];
}

export interface PrdApi {
  method: string;
  path: string;
  description: string;
  auth: string;
  response: string;
}

export interface PrdJtbd {
  priority: number;
  statement: string;
}

export interface PrdUserStory {
  id: string;
  role: string;
  action: string;
  benefit: string;
  jtbdRef: string;
}

export interface PrdComponent {
  name: string;
  type: string;
  description: string;
  linkedStories: string[];
}

export interface PrdStateItem {
  state: string;
  location: string;
  persistence: string;
  notes: string;
}

export interface PrdStackItem {
  layer: string;
  choice: string;
  rationale: string;
}

export interface PrdAcceptance {
  storyRef: string;
  criteria: string[];
}

/** Product Requirement Document terstruktur (siap dipakai AI coding tools). */
export interface Prd {
  title: string;
  summary: string;

  overview: { problem: string; solution: string; aiBuildSummary: string };
  goals: { primary: string; successMetrics: string[]; antiGoals: string[] };
  scope: { inScope: string[]; outOfScope: string[]; technicalConstraints: string[] };
  jtbd: PrdJtbd[];
  userStories: PrdUserStory[];
  experience: {
    designDirection: string;
    keyScreens: string[];
    interactionModel: string[];
    accessibility: string[];
  };
  components: PrdComponent[];
  requirements: PrdRequirement[];
  flows: PrdFlow[];
  integrations: PrdIntegration[];
  apiSurface: PrdApi[];
  dataModel: PrdTable[];
  stateManagement: PrdStateItem[];
  techStack: PrdStackItem[];
  fileStructure: string;
  acceptanceCriteria: PrdAcceptance[];
  risks: { risk: string; mitigation: string }[];
  rollout: { mvpIncludes: string[]; mvpExcludes: string[]; phase2: string[]; nextSteps: string[] };
  openQuestions: string[];
  assumptions: string[];
  checklist: string[];
}

export interface ScoperEvaluation {
  /** Skor kualitas PRD 0-10. */
  score: number;
  /** Kesiapan dibangun oleh AI/engineer 0-10. */
  buildReadiness: number;
  /** Seberapa berdasar pada percakapan (tidak mengarang) 0-10. */
  groundedness: number;
  critique: string;
  missing: string[];
  /** Berapa kali PRD direvisi setelah evaluasi. */
  revisions: number;
}

export interface ScoperResult {
  projectId: string;
  clientId: string;
  leadId: string | null;
  threadId: string | null;
  title: string;
  summary: string;
  prdPath: string;
  prdPdfPath: string;
  workspace: string;
  markdown: string;
  prd: Prd;
  openQuestions: string[];
  evaluation: ScoperEvaluation;
}
