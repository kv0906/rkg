import { useState, useEffect } from 'react';

export function useMediaQuery() {
  const [state, setState] = useState(null);
  useEffect(() => {}, []);
  return state;
}
