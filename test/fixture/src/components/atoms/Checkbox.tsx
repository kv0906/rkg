import React, { useState } from 'react';

/** A toggleable checkbox with an optional label. */
export default function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <label className={focused ? 'focused' : ''}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChange(!checked)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {label && <span>{label}</span>}
    </label>
  );
}
