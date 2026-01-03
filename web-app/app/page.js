'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const error = searchParams.get('error');

  useEffect(() => {
    // Check if first visit
    const tutorialSeen = localStorage.getItem('inbox-cleaner-tutorial-seen');
    if (!tutorialSeen) {
      setShowTutorial(true);
    }

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

  const handleTutorialDone = () => {
    localStorage.setItem('inbox-cleaner-tutorial-seen', 'true');
    setShowTutorial(false);
  };

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

  // Show tutorial on first visit
  if (showTutorial) {
    return (
      <div className="login-container">
        <div className="login-box tutorial-box">
          <div className="login-logo">📧</div>
          <h1>WELCOME!</h1>
          <p className="text-dim">Here's how Inbox Cleaner works:</p>

          <div className="tutorial-steps">
            <div className="tutorial-step">
              <span className="step-icon">1️⃣</span>
              <div className="step-content">
                <strong>Connect Gmail</strong>
                <p>Sign in with Google. Your data stays in your browser.</p>
              </div>
            </div>

            <div className="tutorial-step">
              <span className="step-icon">2️⃣</span>
              <div className="step-content">
                <strong>Scan Your Inbox</strong>
                <p>Click "SCAN" to see all your email senders grouped together.</p>
              </div>
            </div>

            <div className="tutorial-step">
              <span className="step-icon">3️⃣</span>
              <div className="step-content">
                <strong>Select & Delete</strong>
                <p>Check the senders you don't want, click "DELETE SELECTED".</p>
              </div>
            </div>

            <div className="tutorial-step">
              <span className="step-icon">💡</span>
              <div className="step-content">
                <strong>Tip: Use Categories</strong>
                <p>AI sorts emails into Newsletters, Shopping, etc. Delete entire categories at once!</p>
              </div>
            </div>

            <div className="tutorial-step">
              <span className="step-icon">📱</span>
              <div className="step-content">
                <strong>Add to Home Screen</strong>
                <p>iPhone: Tap Share → "Add to Home Screen". Android: Tap menu → "Install app".</p>
              </div>
            </div>
          </div>

          <button className="btn btn-primary btn-block" onClick={handleTutorialDone}>
            LET'S GO!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <button
          className="help-btn"
          onClick={() => setShowTutorial(true)}
          title="How to use"
        >
          ?
        </button>
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

export default function Home() {
  return (
    <Suspense fallback={
      <div className="login-container">
        <div className="loading">
          <div className="spinner"></div>
          <div className="loading-text">Loading...</div>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
