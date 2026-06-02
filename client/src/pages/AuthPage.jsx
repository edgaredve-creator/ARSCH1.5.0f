import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AVATARS } from '../components/ui/Avatar';
import './AuthPage.css';

export function AuthPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login'); // login | register
  const [form, setForm] = useState({ username: '', password: '', avatar: 'marshmallow1' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); setLoading(false); return; }
      login(data.user, data.token);
    } catch {
      setError('Could not connect to server');
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-panel">
        <div className="auth-hero">
          <div className="auth-logo">🍡</div>
          <h1 className="auth-title">Arschmallows</h1>
          <p className="auth-sub">The card game where marshmallows roast!</p>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>
            Login
          </button>
          <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(''); }}>
            Register
          </button>
        </div>

        <div className="auth-form">
          <input
            className="input"
            placeholder="Username"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && submit()}
            autoComplete="username"
            maxLength={20}
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && submit()}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />

          {mode === 'register' && (
            <div className="avatar-picker">
              <p className="avatar-label">Choose your marshmallow:</p>
              <div className="avatar-grid">
                {Object.entries(AVATARS).map(([id, { emoji, color, label }]) => (
                  <div
                    key={id}
                    className={`avatar-option ${form.avatar === id ? 'selected' : ''}`}
                    onClick={() => setForm(f => ({ ...f, avatar: id }))}
                    style={{ '--avatar-color': color }}
                    title={label}
                  >
                    <span className="avatar-emoji">{emoji}</span>
                    <span className="avatar-name">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary btn-lg w-full" onClick={submit} disabled={loading || !form.username || !form.password}>
            {loading ? '⏳ Please wait...' : mode === 'login' ? '🎮 Play!' : '🍡 Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
