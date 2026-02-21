import React, { useEffect } from 'react';
import DashboardLayout from '../components/templates/DashboardLayout';
import UserProfile from '../components/organisms/UserProfile';

/** The main dashboard page showing user profile and activity. */
export default function Dashboard() {
  useEffect(() => {
    document.title = 'Dashboard';
  }, []);

  return (
    <DashboardLayout>
      <UserProfile />
    </DashboardLayout>
  );
}
