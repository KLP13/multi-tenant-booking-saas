import ForgotPasswordModal from '../components/auth/ForgotPasswordModal';
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { triggerGoogleOAuth } from '../utils/googleAuth';
import { ShieldCheck, ArrowRight, Lock, Mail, Building2, Sparkles, Check, Globe } from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

export default function TenantLoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // New Google user registration state
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleName, setGoogleName] = useState('');
  const [googlePicture, setGooglePicture] = useState('');
  const [newBusinessName, setNewBusinessName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  // Handle standard email/password login
  const handleEmailLogin = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Please enter your email and password');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/universal-login', { email, password });

      localStorage.setItem('saas_auth_token', res.data.token);
      localStorage.setItem('saas_auth_user', JSON.stringify(res.data.user));

      toast.success(`Welcome back, ${res.data.user.name || res.data.user.email}!`);
      navigate(`/${res.data.tenant.slug}/admin`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  // Trigger Google Account Chooser Popup
  const handleGoogleClick = async () => {
    try {
      setLoading(true);
      const profile = await triggerGoogleOAuth();

      // Check if user belongs to an existing tenant
      const res = await api.post('/auth/google', {
        email: profile.email,
        name: profile.name,
      });

      if (res.data.isNewUser) {
        // New user: ask for business name & slug
        setGoogleEmail(profile.email);
        setGoogleName(profile.name);
        setGooglePicture(profile.picture || '');
        setShowSetupModal(true);
        toast.info('Google account verified! Complete your business details.');
      } else {
        // Existing user: log in directly
        localStorage.setItem('saas_auth_token', res.data.token);
        localStorage.setItem('saas_auth_user', JSON.stringify(res.data.user));

        toast.success(`Welcome back, ${res.data.user.name || res.data.user.email}!`);
        navigate(`/${res.data.tenant.slug}/admin`);
      }
    } catch (err) {
      if (err.message && !err.message.includes('popup_closed_by_user')) {
        toast.error(err.message || 'Google sign-in was cancelled or failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Complete new tenant registration from Google
  const handleCompleteGoogleRegistration = async (e) => {
    e.preventDefault();

    if (!newBusinessName || !newSlug) {
      toast.error('Please enter your business name and custom booking link');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/google', {
        email: googleEmail,
        name: googleName,
        businessName: newBusinessName,
        slug: newSlug,
      });

      localStorage.setItem('saas_auth_token', res.data.token);
      localStorage.setItem('saas_auth_user', JSON.stringify(res.data.user));

      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      toast.success(`Congratulations! "${res.data.tenant.name}" is now live.`);
      setShowSetupModal(false);
      navigate(`/${res.data.tenant.slug}/admin`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create business portal');
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (val) => {
    setNewBusinessName(val);
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setNewSlug(generatedSlug);
  };

  const handleCopyLink = () => {
    if (!newSlug) return;
    navigator.clipboard.writeText(`${window.location.origin}/${newSlug}`);
    setCopiedLink(true);
    toast.success('Public booking link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)' }}>
      {/* Header */}
      <header className="editorial-header">
        <div className="container editorial-header-inner">
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              backgroundColor: 'var(--accent)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-serif)',
              fontWeight: 'bold',
            }}>
              B
            </div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: '600' }}>
              Bespoke Bookings
            </span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link to="/register" className="btn btn-outline" style={{ fontSize: '13px' }}>
              Register Business &rarr;
            </Link>
            <Link to="/" className="btn btn-ghost" style={{ fontSize: '13px' }}>
              &larr; Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="container" style={{ padding: '60px 24px', flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <span className="badge badge-available" style={{ marginBottom: '10px' }}>
              <ShieldCheck size={12} /> Tenant Portal Access
            </span>
            <h1 style={{ fontSize: '32px', marginBottom: '8px', letterSpacing: '-0.02em' }}>
              Sign in to your business.
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Manage your team, operating hours, and customer reservations.
            </p>
          </div>

          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '32px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04)',
          }}>
            {/* 1. Continue with Google Button (Triggers authentic Google Popup) */}
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={loading}
              className="btn btn-outline"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '12px',
                fontSize: '14px',
                fontWeight: '600',
                backgroundColor: '#FFFFFF',
                borderColor: '#DADCE0',
                color: '#3C4043',
                marginBottom: '20px',
                cursor: 'pointer',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z" />
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z" />
              </svg>
              {loading ? 'Connecting with Google...' : 'Continue with Google'}
            </button>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              margin: '20px 0',
              textAlign: 'center',
            }}>
              <div style={{ flex: 1, borderBottom: '1px solid var(--border)' }} />
              <span style={{ padding: '0 12px', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                or with email
              </span>
              <div style={{ flex: 1, borderBottom: '1px solid var(--border)' }} />
            </div>

            {/* 2. Email & Password Form */}
            <form onSubmit={handleEmailLogin}>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Business Owner / Staff Email</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    required
                    placeholder="you@yourbusiness.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field"
                    style={{ paddingLeft: '32px' }}
                    disabled={loading}
                  />
                  <Mail size={14} style={{ position: 'absolute', left: '10px', top: '13px', color: 'var(--text-secondary)' }} />
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
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field"
                    style={{ paddingLeft: '32px' }}
                    disabled={loading}
                  />
                  <Lock size={14} style={{ position: 'absolute', left: '10px', top: '13px', color: 'var(--text-secondary)' }} />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '15px' }}
                disabled={loading}
              >
                {loading ? 'Authenticating...' : 'Sign In to Dashboard'} <ArrowRight size={16} />
              </button>
            </form>

            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
              New to Bespoke Bookings?{' '}
              <Link to="/register" style={{ color: 'var(--accent)', fontWeight: '600' }}>
                Create your business &rarr;
              </Link>
            </div>
          </div>
        </div>
      </main>
      <ForgotPasswordModal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        initialEmail={email}
        tenantSlug=""
      />

      {/* MODAL: New Tenant Setup (Only triggers if Google account is not yet registered to any business) */}
      {showSetupModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(23, 23, 23, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            width: '100%',
            maxWidth: '460px',
            padding: '32px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.15)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 12px',
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: '9999px',
                fontSize: '12px',
                color: '#065F46',
                fontWeight: '600',
                marginBottom: '12px',
              }}>
                <Check size={13} color="#059669" /> Google Account Verified
              </div>

              {googlePicture ? (
                <img
                  src={googlePicture}
                  alt={googleName}
                  style={{ width: '54px', height: '54px', borderRadius: '50%', margin: '0 auto 10px', display: 'block', border: '2px solid var(--border)' }}
                />
              ) : (
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: '#4285F4', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: '20px', fontWeight: 'bold' }}>
                  {googleName ? googleName.charAt(0) : 'G'}
                </div>
              )}

              <h3 style={{ fontSize: '22px', marginBottom: '4px' }}>Welcome, {googleName || 'Partner'}!</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Linked with <strong>{googleEmail}</strong>. Name your business to launch your booking portal.
              </p>
            </div>

            <form onSubmit={handleCompleteGoogleRegistration}>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Business / Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Tennis Club, Coastal Board Rentals"
                  value={newBusinessName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="input-field"
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Custom Booking Link *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    required
                    placeholder="apex-tennis"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value.toLowerCase().trim())}
                    className="input-field mono"
                    style={{ paddingLeft: '32px' }}
                  />
                  <Globe size={14} style={{ position: 'absolute', left: '10px', top: '13px', color: 'var(--text-secondary)' }} />
                </div>

                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-alt)',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    URL:{' '}
                    <span className="mono" style={{ color: 'var(--accent)', fontWeight: '600' }}>
                      {window.location.origin}/{newSlug || 'your-business'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    disabled={!newSlug}
                    className="btn btn-outline"
                    style={{
                      padding: '3px 8px',
                      fontSize: '11px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      height: '24px',
                      backgroundColor: copiedLink ? '#ECFDF5' : '#FFFFFF',
                      borderColor: copiedLink ? '#10B981' : 'var(--border)',
                      color: copiedLink ? '#047857' : 'var(--text-primary)',
                    }}
                  >
                    {copiedLink ? <Check size={12} color="#047857" /> : 'Copy'}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label className="input-label">Platform Currency</label>
                <input
                  type="text"
                  disabled
                  value="INR (₹) — Indian Rupee"
                  className="input-field"
                  style={{ backgroundColor: '#F8F9FA' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowSetupModal(false)}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={loading}
                >
                  {loading ? 'Launching...' : 'Launch Portal &rarr;'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
