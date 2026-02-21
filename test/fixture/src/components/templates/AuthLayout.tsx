import React from 'react';
import LoginForm from '../organisms/LoginForm';

/** Authentication layout wrapping the login form. */
export default function AuthLayout() {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <LoginForm />
      </div>
    </div>
  );
}
