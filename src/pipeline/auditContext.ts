import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage<{ jobId: string }>();
export const currentJobId = () => context.getStore()?.jobId;
export function withJobAudit<T>(jobId: string, work: () => Promise<T>): Promise<T> {
  return context.run({ jobId }, work);
}
