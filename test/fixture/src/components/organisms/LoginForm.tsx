import React, { useState } from 'react';
import { FormField } from '../molecules';
import { Button } from '../atoms';

export default function LoginForm() {
  const [submitted, setSubmitted] = useState(false);
  return (
    <form>
      <FormField label="Username" />
      <FormField label="Password" />
      <Button onClick={() => setSubmitted(true)}>Login</Button>
    </form>
  );
}
