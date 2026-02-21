import React from 'react';
import { Input } from '../atoms/Input';

/** A labeled form field that wraps an Input atom. */
export default function FormField({ label }: { label: string }) {
  return (
    <div>
      <label>{label}</label>
      <Input />
    </div>
  );
}
