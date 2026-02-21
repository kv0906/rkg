import React, { useState, useCallback } from 'react';
import Checkbox from '../atoms/Checkbox';

/** A group of checkboxes that manages multiple selections. */
export default function CheckboxGroup({ options }: { options: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((option: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  }, []);

  return (
    <div className="checkbox-group">
      {options.map(opt => (
        <Checkbox key={opt} checked={selected.has(opt)} onChange={() => toggle(opt)} label={opt} />
      ))}
    </div>
  );
}
