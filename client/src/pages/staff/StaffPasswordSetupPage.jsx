import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ShieldCheck, Lock, Eye, EyeOff, Check, AlertCircle, ArrowRight, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

export default function StaffPasswordSetupPage() {
  const { tenantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');

  const [loadingInfo, setLoadingInfo] = useState(true);
  const [inviteInfo, setInviteInfo] = useState(null);
  const [tokenError, setTokenError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError('No invitation token was provided. Please check your invitation email link.');
      setLoadingInfo(false);
      return;
    }

    const checkToken = async () => {
      try {
        setLoadingInfo(true);
        const res = await api.get(`/auth/staff/invite-info?token=${token}`);
        setInviteInfo(res.data);
      } catch (err) {
        setTokenError(err.response?.data?.error || 'This invitation link is invalid or has expired. Please contact your workspace administrator.');
      } finally {
        setLoadingInfo(false);
      }
    };

    checkToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password || password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post('/auth/staff/set-password', {
        token,
        password,
        confirmPassword,
      });

      localStorage.setItem('saas_auth_token', res.data.token);
      localStorage.setItem('saas_auth_user', JSON.stringify(res.data.user));

      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });

      toast.success(res.data.message || 'Password successfully set! Welcome to your workspace.');
      navigate(`/${inviteInfo?.tenantSlug || tenantSlug}/admin`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to set password. Link may have expired.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInfo) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', color: 'var(--text-secondary)' }}>
          Verifying your invitation credentials...
        </p>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', padding: '20px' }}>
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '40px',
          maxWidth: '460px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0,0,0,0.05)',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#EF4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
          }}>
            <AlertCircle size={24} />
          </div>
          <h2 style={{ fontSize: '20px', fontFamily: 'var(--font-serif)', marginBottom: '8px' }}>Invitation Expired or Invalid</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
            {tokenError}
          </p>
          <Link
            to={`/${tenantSlug}/admin/login`}
            className="btn btn-outline"
            style={{ width: '100%', padding: '12px' }}
          >
            Go to Workspace Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)' }}>
      {/* Header */}
      <header className="editorial-header">
        <div className="container editorial-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '40px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 20px 40px rgba(0,0,0,0.06)',
        }}>
          {/* Welcome Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              backgroundColor: 'rgba(5, 150, 105, 0.1)',
              color: '#059669',
              padding: '3px 8px',
              borderRadius: '12px',
            }}>
              <ShieldCheck size={13} /> Official Workspace Invite
            </span>
          </div>

          <h1 style={{ fontSize: '24px', fontFamily: 'var(--font-serif)', margin: '0 0 6px 0' }}>
            Set Up Your Account
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 24px 0', lineHeight: 1.5 }}>
            You have been invited to join <strong>{inviteInfo?.tenantName}</strong> as <strong>{inviteInfo?.role === 'ADMIN' ? 'Administrator' : 'Front-Desk Operations Staff'}</strong>. Please choose your password to activate your workspace access.
          </p>

          <div style={{
            backgroundColor: 'var(--bg-alt)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            padding: '12px 16px',
            marginBottom: '24px',
            fontSize: '13px',
          }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account Email</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{inviteInfo?.email}</div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="input-label" style={{ margin: 0 }}>Create Password *</label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="input-label">Confirm Password *</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                style={{
                  borderColor: confirmPassword
                    ? password === confirmPassword
                      ? '#059669'
                      : '#EF4444'
                    : 'var(--border)',
                }}
              />
              {confirmPassword && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: password === confirmPassword ? '#059669' : '#EF4444',
                }}>
                  {password === confirmPassword ? (
                    <>
                      <Check size={12} />
                      <span>Passwords match</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={12} />
                      <span>Passwords do not match</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || (confirmPassword && password !== confirmPassword)}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '8px',
                fontSize: '14px',
                fontWeight: 600,
                backgroundColor: '#059669',
                borderColor: '#059669',
              }}
            >
              {submitting ? 'Activating Account...' : 'Set Password & Enter Workspace'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
