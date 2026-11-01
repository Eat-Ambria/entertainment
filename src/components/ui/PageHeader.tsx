/**
 * Page title row with optional description and right-side actions. Workspace pages sit on the dark
 * stage top, so the title is a light serif like the dashboard greeting.
 */
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex animate-rise flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-display text-3xl leading-tight text-ivory sm:text-4xl">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-ivory/75 sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
