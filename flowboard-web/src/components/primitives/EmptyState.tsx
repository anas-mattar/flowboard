import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  heading: string;
  body: string;
  action?: ReactNode;
}

/** Empty-state primitive (BM §5, FB-03 spec §3). First used for "no boards yet" (FB-04). */
export function EmptyState({ icon, heading, body, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon ? (
        <div className="empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 className="empty-state__heading">{heading}</h2>
      <p className="empty-state__body">{body}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
