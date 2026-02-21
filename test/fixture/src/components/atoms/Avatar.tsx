import React from 'react';

interface AvatarProps {
  src: string;
  size?: 'sm' | 'md' | 'lg';
}

/** Displays a user avatar image in a circular frame. */
export default function Avatar({ src, size = 'md' }: AvatarProps) {
  return <img src={src} className={`avatar avatar-${size}`} />;
}
