import React, { useState } from 'react';

export function Input({ placeholder }: { placeholder?: string }) {
  const [value, setValue] = useState('');
  return <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />;
}
