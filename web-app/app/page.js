'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const error = searchParams.get('error');

  useEffect(() => {
    // Check if user is already authenticated
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.authenticated) {
          router.push('/dashboard');
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="login-container">
        <div className="loading">
          <div className="spinner"></div>
          <div className="loading-text">Checking authentication...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-logo">📧</div>
        <h1>INBOX CLEANER</h1>
        <p className="text-dim">Privacy-first Gmail cleanup tool</p>

        {error && (
          <div style={{ color: 'var(--error)', marginBottom: '16px' }}>
            {error === 'auth_failed' ? 'Authentication failed. Please try again.' :
             error === 'no_code' ? 'Invalid login attempt.' : error}
          </div>
        )}

        <a href="/api/auth/login" className="btn btn-primary btn-block">
          🔗 CONNECT GMAIL
        </a>

        <div className="privacy-note">
          <h3>🔒 PRIVACY FIRST</h3>
          <ul>
            <li>Your data never leaves your browser</li>
            <li>We only access email metadata</li>
            <li>No ads, no data selling</li>
            <li>Open source & transparent</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
