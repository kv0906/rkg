import React from 'react';
import { SearchBar } from '../molecules';
import { Button } from '../atoms';

export default function Header() {
  return (
    <header>
      <SearchBar />
      <Button>Menu</Button>
    </header>
  );
}
