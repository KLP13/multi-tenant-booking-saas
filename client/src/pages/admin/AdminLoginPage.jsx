import ForgotPasswordModal from '../../components/auth/ForgotPasswordModal';
import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ShieldCheck, ArrowRight, Lock, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { triggerGoogleOAuth } from '../../utils/googleAuth';

export default function AdminLoginPage() {
  const { tenantSlug } = useParams();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      const res = await api.post('/auth/login', {
        tenantSlug,
        email,
        password,
      });

      localStorage.setItem('saas_auth_token', res.data.token);
      localStorage.setItem('saas_auth_user', JSON.stringify(res.data.user));

      toast.success(`Welcome back, ${res.data.user.name || res.data.user.email}!`);
      navigate(`/${tenantSlug}/admin`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid credentials or tenant mismatch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg)',
      padding: '24px',
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        width: '100%',
        maxWidth: '420px',
        padding: '36px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            backgroundColor: 'var(--accent-light)',
            color: 'var(--accent)',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '14px',
          }}>
            <ShieldCheck size={22} />
          </div>
          <h2 style={{ fontSize: '24px', marginBottom: '6px' }}>Staff & Admin Portal</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Sign in to manage bookings and resources for <strong>{tenantSlug}</strong>
          </p>
        </div>

        {/* Continue with Google */}
        <button
          type="button"
          onClick={async () => {
            try {
              setLoading(true);
              const googleProfile = await triggerGoogleOAuth();
              const res = await api.post('/auth/google', {
                email: googleProfile.email,
                name: googleProfile.name,
              });

              localStorage.setItem('saas_auth_token', res.data.token);
              localStorage.setItem('saas_auth_user', JSON.stringify(res.data.user));

              toast.success(`Google verification successful! Welcome back.`);
              navigate(`/${tenantSlug}/admin`);
            } catch (err) {
              toast.error(err.response?.data?.error || err.message || 'Google login cancelled');
            } finally {
              setLoading(false);
            }
          }}
          className="btn btn-outline"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '10px',
            fontSize: '13px',
            fontWeight: '600',
            backgroundColor: '#FFFFFF',
            borderColor: '#DADCE0',
            color: '#3C4043',
            marginBottom: '16px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z" />
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z" />
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z" />
          </svg>
          Continue with Google
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '16px',
          textAlign: 'center',
        }}>
          <div style={{ flex: 1, borderBottom: '1px solid var(--border)' }} />
          <span style={{ padding: '0 10px', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            or with password
          </span>
          <div style={{ flex: 1, borderBottom: '1px solid var(--border)' }} />
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label className="input-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                placeholder="you@yourbusiness.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="input-label" style={{ marginBottom: 0 }}>Password</label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--accent)',
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  Forgot password?
                </button>
              </div>
            <input
              type="password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: '16px' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In to Dashboard'} <ArrowRight size={16} />
          </button>

          <div style={{ textAlign: 'center' }}>
            <Link
              to={`/${tenantSlug}`}
              style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'underline' }}
            >
              &larr; Return to Public Booking Site
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
