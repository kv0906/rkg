import React, { useState, useContext } from 'react';
import DashboardLayout from '../components/templates/DashboardLayout';
import CheckboxGroup from '../components/molecules/CheckboxGroup';
import { Button } from '../components/atoms';

/** The settings page for managing user preferences. */
export default function Settings() {
  const [saved, setSaved] = useState(false);

  return (
    <DashboardLayout>
      <h1>Settings</h1>
      <CheckboxGroup options={['Email notifications', 'Dark mode', 'Auto-save']} />
      <Button onClick={() => setSaved(true)}>Save</Button>
    </DashboardLayout>
  );
}
