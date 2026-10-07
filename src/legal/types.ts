/** Tipe untuk Agent Legal & Finance (F2 · Deal Desk). */

export interface LegalClause {
  title: string;
  body: string;
}

/** Draf klausul kontrak & NDA yang dihasilkan LLM. */
export interface LegalDraft {
  contractTitle: string;
  scopeSummary: string;
  deliverables: string[];
  timeline: string;
  paymentTerms: string;
  clauses: LegalClause[];
  ndaClauses: LegalClause[];
}

export interface LegalResult {
  projectId: string;
  clientId: string | null;
  invoiceId: string;
  amount: number;
  currency: string;
  status: string;
  contractPath: string;
  ndaPath: string;
  invoicePath: string;
  workspace: string;
  draft: LegalDraft;
}
