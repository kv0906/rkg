import React from 'react';

/** A basic button component for user interactions. */
export default function Button({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <button onClick={onClick}>{children}</button>;
}
