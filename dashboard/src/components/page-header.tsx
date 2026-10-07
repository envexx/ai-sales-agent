import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div data-slot="page-header" className="bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-start justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl leading-8 font-medium tracking-[-0.025em]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-body"
      className={cn("mx-auto w-full min-w-0 max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8", className)}
    >
      {children}
    </div>
  );
}
