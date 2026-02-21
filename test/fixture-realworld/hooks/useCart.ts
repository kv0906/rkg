import { useState, useEffect } from 'react';

export function useCart() {
  const [state, setState] = useState(null);
  useEffect(() => {}, []);
  return state;
}
