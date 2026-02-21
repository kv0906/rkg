import React, { useMemo } from 'react';
import Avatar from '../atoms/Avatar';
import { Badge } from '../atoms/Badge';

/** Displays a user card with avatar and notification badge. */
export default function UserCard({ name, avatarSrc, notifications }: { name: string; avatarSrc: string; notifications: number }) {
  const showBadge = useMemo(() => notifications > 0, [notifications]);
  return (
    <div className="user-card">
      <Avatar src={avatarSrc} size="md" />
      <span>{name}</span>
      {showBadge && <Badge count={notifications} />}
    </div>
  );
}
