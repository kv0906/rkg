import React, { useState } from 'react';
import { Input, Icon } from '../atoms';

/** Search bar with auto-complete. Combines Input and Icon atoms. */
export default function SearchBar() {
  const [query, setQuery] = useState('');
  return (
    <div>
      <Input placeholder="Search..." />
      <Icon name="search" />
    </div>
  );
}
