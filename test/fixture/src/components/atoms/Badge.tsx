import React from 'react';

/** A small count badge for notifications and status indicators. */
export const Badge = ({ count, variant = 'default' }: { count: number; variant?: string }) => {
  return <span className={`badge badge-${variant}`}>{count}</span>;
};
