import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { triggerGoogleOAuth } from '../utils/googleAuth';
import { Building2, Sparkles, ArrowRight, ShieldCheck, Check, Globe, Copy, Mail, ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

export default function RegisterTenantPage() {
  const navigate = useNavigate();

  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isGoogleVerified, setIsGoogleVerified] = useState(false);

  const [step, setStep] = useState('form'); // 'form' | 'otp'
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);


  const handleGoogleClick = async () => {
    try {
      setLoading(true);
      const profile = await triggerGoogleOAuth();

      // Pre-fill fields from verified Google profile
      setEmail(profile.email);
      setAdminName(profile.name);
      setPassword('');
      setIsGoogleVerified(true);
      setStep('form');
      toast.success(`Google verified (${profile.email})! Please enter your business name above.`);
    } catch (err) {
      if (err.message && !err.message.includes('popup_closed_by_user')) {
        toast.error(err.message || 'Google verification failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!slug) {
      toast.error('Enter a business name first to generate your link');
      return;
    }
    const publicUrl = `${window.location.origin}/${slug}`;
    navigator.clipboard.writeText(publicUrl);
    setCopiedLink(true);
    toast.success('Public booking link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Auto-generate clean slug from business name
  const handleNameChange = (e) => {
    const val = e.target.value;
    setBusinessName(val);
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(generatedSlug);
  };

  // 1. Initial submit: If Google verified, register directly. If manual, send OTP!
  const handleSubmitForm = async (e) => {
    e.preventDefault();

    if (!businessName || !slug || !email) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!isGoogleVerified && (!password || password.length < 6)) {
      toast.error('Please choose a password with at least 6 characters');
      return;
    }

    // Google registration needs no manual OTP (Google already verified the email)
    if (isGoogleVerified) {
      try {
        setLoading(true);
        const res = await api.post('/auth/google', {
          email,
          name: adminName,
          businessName,
          slug,
        });

        localStorage.setItem('saas_auth_token', res.data.token);
        localStorage.setItem('saas_auth_user', JSON.stringify(res.data.user));

        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
        });

        toast.success(`🎉 "${res.data.tenant.name}" is live! Portal links emailed to ${email}.`);
        navigate(`/${res.data.tenant.slug}/admin`);
      } catch (err) {
        toast.error(err.response?.data?.error || 'Registration failed. Please try another URL slug.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Manual registration: Send 6-digit OTP to verify email
    try {
      setSendingOtp(true);
      const res = await api.post('/auth/send-registration-otp', {
        email,
        businessName,
        slug,
      });

      if (res.data.devOtp) {
        setDevOtp(res.data.devOtp);
      }
      setStep('otp');
      toast.success(`Verification code sent to ${email}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send verification code. Please check your slug or email.');
    } finally {
      setSendingOtp(false);
    }
  };

  // 2. Resend OTP
  const handleResendOtp = async () => {
    try {
      setSendingOtp(true);
      const res = await api.post('/auth/send-registration-otp', {
        email,
        businessName,
        slug,
      });
      if (res.data.devOtp) {
        setDevOtp(res.data.devOtp);
      }
      toast.success('A new 6-digit verification code has been sent!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resend code');
    } finally {
      setSendingOtp(false);
    }
  };

  // 3. Verify OTP & Finalize Registration
  const handleVerifyOtp = async (e) => {
    e.preventDefault();

    if (!otp.trim() || otp.trim().length !== 6) {
      toast.error('Please enter the 6-digit verification code');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/register-tenant', {
        businessName,
        slug,
        currency,
        adminName,
        email,
        password,
        otp: otp.trim(),
      });

      localStorage.setItem('saas_auth_token', res.data.token);
      localStorage.setItem('saas_auth_user', JSON.stringify(res.data.user));

      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });

      toast.success(`🎉 Email verified! Portal links have been emailed to ${email}.`);
      navigate(`/${res.data.tenant.slug}/admin`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid or expired code. Please try again.');
    } finally {
      setLoading(false);
    }
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
          <Link to="/" className="btn btn-ghost" style={{ fontSize: '13px' }}>
            &larr; Back to Home
          </Link>
        </div>
      </header>

      {/* Main Registration Container */}
      <main className="container" style={{ padding: '60px 24px', flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '580px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <span className="badge badge-available" style={{ marginBottom: '12px' }}>
              <Sparkles size={12} /> Instant Business Onboarding
            </span>
            <h1 style={{ fontSize: '36px', marginBottom: '10px', letterSpacing: '-0.02em' }}>
              Register your business.
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
              Get your custom online booking link and management dashboard in 60 seconds.
            </p>
          </div>

          {step === 'otp' ? (
            /* OTP Verification Screen */
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '40px 36px',
              boxShadow: '0 10px 35px rgba(0, 0, 0, 0.03)',
              textAlign: 'center',
            }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px',
              }}>
                <Mail size={30} />
              </div>

              <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px', letterSpacing: '-0.01em' }}>
                Verify Your Business Email
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
                We've sent a 6-digit confirmation code to <strong>{email}</strong>.<br />
                Enter the code below to verify your email and activate <strong>{businessName}</strong>.
              </p>


              <form onSubmit={handleVerifyOtp} style={{ maxWidth: '360px', margin: '0 auto' }}>
                <div style={{ marginBottom: '24px' }}>
                  <label className="input-label" style={{ textAlign: 'left', display: 'block', marginBottom: '8px' }}>
                    Enter 6-Digit Verification Code *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="------"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                    className="input-field mono"
                    style={{
                      fontSize: '28px',
                      letterSpacing: '0.3em',
                      textAlign: 'center',
                      padding: '12px',
                      fontWeight: '700',
                    }}
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '15px', marginBottom: '16px' }}
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? 'Activating Business Portal...' : 'Verify & Launch Portal'} <ArrowRight size={16} />
                </button>
              </form>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '13px' }}>
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="btn btn-ghost"
                  style={{ fontSize: '12px', gap: '5px', padding: '6px 12px' }}
                >
                  <ArrowLeft size={14} /> Back to Edit Details
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={sendingOtp}
                  className="btn btn-ghost"
                  style={{ fontSize: '12px', color: 'var(--accent)', gap: '5px', padding: '6px 12px' }}
                >
                  <RefreshCw size={13} className={sendingOtp ? 'animate-spin' : ''} />
                  {sendingOtp ? 'Sending code...' : 'Resend Code'}
                </button>
              </div>

              <div style={{
                marginTop: '28px',
                paddingTop: '18px',
                borderTop: '1px solid var(--border)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}>
                📨 <strong>Next:</strong> Your booking portal link and admin access links will be sent directly to <strong>{email}</strong> upon verification!
              </div>
            </div>
          ) : (
            /* Business Registration Form */
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '36px',
              boxShadow: '0 10px 35px rgba(0, 0, 0, 0.03)',
            }}>
              {/* Continue with Google */}
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
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
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
                marginBottom: '24px',
                textAlign: 'center',
              }}>
                <div style={{ flex: 1, borderBottom: '1px solid var(--border)' }} />
                <span style={{ padding: '0 12px', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  or register with email
                </span>
                <div style={{ flex: 1, borderBottom: '1px solid var(--border)' }} />
              </div>

              <form onSubmit={handleSubmitForm}>
                {/* Section 1: Business Details */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: '16px' }}>
                    1. Business Information
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label className="input-label">Business / Company Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. City Cruise Bike Rentals, Apex Sound Lab..."
                      value={businessName}
                      onChange={handleNameChange}
                      className="input-field"
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label className="input-label">Custom Booking Link *</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        required
                        placeholder="city-cruise-bikes"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
                        className="input-field mono"
                        style={{ paddingLeft: '32px' }}
                      />
                      <Globe size={14} style={{ position: 'absolute', left: '10px', top: '13px', color: 'var(--text-secondary)' }} />
                    </div>
                    <div style={{
                      marginTop: '8px',
                      padding: '10px 12px',
                      backgroundColor: 'var(--bg-alt)',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Public link:{' '}
                        <span className="mono" style={{ color: 'var(--accent)', fontWeight: '600' }}>
                          {window.location.origin}/{slug || 'your-business'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        disabled={!slug}
                        className="btn btn-outline"
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          whiteSpace: 'nowrap',
                          height: '28px',
                          backgroundColor: copiedLink ? '#ECFDF5' : '#FFFFFF',
                          borderColor: copiedLink ? '#10B981' : 'var(--border)',
                          color: copiedLink ? '#047857' : 'var(--text-primary)',
                          cursor: slug ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {copiedLink ? (
                          <>
                            <Check size={12} color="#047857" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={12} /> Copy Link
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="input-label">Currency for Pricing</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="input-field"
                      style={{ width: '100%', backgroundColor: '#F8F9FA' }}
                    >
                      <option value="INR">INR (₹) — Indian Rupee</option>
                    </select>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Platform currently configured exclusively for Indian Rupee (INR).
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', margin: '24px 0' }} />

                {/* Section 2: Owner Account */}
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: '16px' }}>
                    2. Business Owner Credentials
                  </div>

                  {isGoogleVerified && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      backgroundColor: '#ECFDF5',
                      border: '1px solid #A7F3D0',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '12px',
                      color: '#065F46',
                      fontWeight: '600',
                      marginBottom: '16px',
                    }}>
                      <Check size={14} color="#059669" /> Verified with Google ({email})
                    </div>
                  )}

                  <div style={{ marginBottom: '16px' }}>
                    <label className="input-label">Your Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Alex Morgan"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="input-field"
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label className="input-label">Email Address (for admin login) *</label>
                    <input
                      type="email"
                      required
                      placeholder="alex@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field"
                    />
                  </div>

                  {!isGoogleVerified ? (
                    <div>
                      <label className="input-label">Password *</label>
                      <input
                        type="password"
                        required
                        placeholder="At least 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-field"
                      />
                    </div>
                  ) : (
                    <div style={{
                      padding: '12px 14px',
                      backgroundColor: 'var(--bg-alt)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      <ShieldCheck size={16} color="var(--success)" />
                      <span><strong>Passwordless Account:</strong> You are authenticating via Google. No password required.</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '15px' }}
                  disabled={loading || sendingOtp}
                >
                  {isGoogleVerified
                    ? (loading ? 'Creating Your Business...' : 'Launch Business Booking Portal')
                    : (sendingOtp ? 'Sending Verification Code...' : 'Verify Email & Continue')}
                  <ArrowRight size={16} />
                </button>
              </form>

              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Already registered your business?{' '}
                <Link to="/login" style={{ color: 'var(--accent)', fontWeight: '600' }}>
                  Sign In &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
