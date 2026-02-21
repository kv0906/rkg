import { useState, useEffect } from 'react';

export function useAuth() {
  const [state, setState] = useState(null);
  useEffect(() => {}, []);
  return state;
}
