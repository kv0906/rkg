import React from 'react';
import Icon from '../atoms/Icon';
import Tooltip from '../atoms/Tooltip';

/** A navigation item with an icon and tooltip. */
export default function NavItem({ label, iconName, href }: { label: string; iconName: string; href: string }) {
  return (
    <Tooltip content={label}>
      <a href={href} className="nav-item">
        <Icon name={iconName} />
        <span>{label}</span>
      </a>
    </Tooltip>
  );
}
