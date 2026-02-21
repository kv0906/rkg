import React from 'react';
import Header from '../organisms/Header';
import Sidebar from '../organisms/Sidebar';

/** Main dashboard layout with header and sidebar navigation. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-layout">
      <Header />
      <div className="dashboard-body">
        <Sidebar />
        <main>{children}</main>
      </div>
    </div>
  );
}
