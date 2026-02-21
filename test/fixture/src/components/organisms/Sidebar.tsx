import React, { useState } from 'react';
import NavItem from '../molecules/NavItem';
import Icon from '../atoms/Icon';

/** A collapsible sidebar navigation panel. */
export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button onClick={() => setCollapsed(!collapsed)}>
        <Icon name={collapsed ? 'expand' : 'collapse'} />
      </button>
      <NavItem label="Home" iconName="home" href="/" />
      <NavItem label="Settings" iconName="gear" href="/settings" />
    </nav>
  );
}
