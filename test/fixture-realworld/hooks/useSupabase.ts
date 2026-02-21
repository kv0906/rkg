import { useState, useEffect } from 'react';

export function useSupabase() {
  const [state, setState] = useState(null);
  useEffect(() => {}, []);
  return state;
}
