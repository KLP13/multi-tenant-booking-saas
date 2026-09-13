import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { triggerGoogleOAuth } from '../../utils/googleAuth';
import { generateGoogleCalendarUrl } from '../../utils/calendar';
import { formatBookingSlotRange } from '../../utils/dateTime';
import { 
  X, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Sparkles, 
  LogOut, 
  ExternalLink,
  ChevronRight,
  User,
  Ticket,
  ShieldCheck,
  KeyRound,
  Mail,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

export default function CustomerBookingsModal({ tenantSlug, isOpen, onClose }) {
  const [customer, setCustomer] = useState(() => {
    try {
      const saved = localStorage.getItem(`bespoke_customer_profile_${tenantSlug}`) || localStorage.getItem('bespoke_customer_profile');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [customerToken, setCustomerToken] = useState(() => {
    return localStorage.getItem(`bespoke_customer_token_${tenantSlug}`) || '';
  });

  const [authStep, setAuthStep] = useState('email'); // 'email' | 'otp'
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'history'
  const [imgError, setImgError] = useState(false);

  // Check URL query parameters for magic tokens on open
  useEffect(() => {
    if (!isOpen) return;

    try {
      const savedProf = localStorage.getItem(`bespoke_customer_profile_${tenantSlug}`) || localStorage.getItem('bespoke_customer_profile');
      if (savedProf) {
        setCustomer(JSON.parse(savedProf));
      }
    } catch (e) {}

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token') || urlParams.get('bookingToken');
      if (urlToken) {
        setCustomerToken(urlToken);
        localStorage.setItem(`bespoke_customer_token_${tenantSlug}`, urlToken);
        fetchBookings(urlToken);
        return;
      }
    } catch (e) {
      // Ignore URL parsing errors
    }

    const savedToken = localStorage.getItem(`bespoke_customer_token_${tenantSlug}`);
    if (savedToken) {
      setCustomerToken(savedToken);
      fetchBookings(savedToken);
    } else {
      setCustomerToken('');
      setBookings([]);
      setAuthStep('email');
    }
  }, [isOpen, tenantSlug]);

  const fetchBookings = async (token, profileOverride = null) => {
    try {
      setLoading(true);
      const res = await api.get(`/tenants/${tenantSlug}/customer/bookings`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setBookings(res.data.bookings || []);
      setTenantInfo(res.data.tenant || null);

      const active = profileOverride || customer;
      if (res.data.customerEmail) {
        const verifiedEmail = res.data.customerEmail.toLowerCase();
        if (!active || active.email?.toLowerCase() !== verifiedEmail) {
          const profile = {
            name: active?.name || verifiedEmail.split('@')[0],
            email: verifiedEmail,
            picture: active?.picture || null,
          };
          setCustomer(profile);
          localStorage.setItem(`bespoke_customer_profile_${tenantSlug}`, JSON.stringify(profile));
          localStorage.setItem('bespoke_customer_profile', JSON.stringify(profile));
        }
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem(`bespoke_customer_token_${tenantSlug}`);
        setCustomerToken('');
        setBookings([]);
        setAuthStep('email');
      } else {
        toast.error(err.response?.data?.error || 'Failed to load reservations');
      }
    } finally {
      setLoading(false);
    }
  };

  // Google 1-Click Sign-In
  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      const profile = await triggerGoogleOAuth();
      
      // Exchange Google identity for a backend customer token
      const authRes = await api.post(`/tenants/${tenantSlug}/customer/auth/google`, {
        email: profile.email.toLowerCase(),
      });

      const token = authRes.data.customerToken;
      const customerData = {
        name: profile.name,
        email: profile.email.toLowerCase(),
        picture: profile.picture,
      };

      setCustomer(customerData);
      setCustomerToken(token);
      localStorage.setItem(`bespoke_customer_profile_${tenantSlug}`, JSON.stringify(customerData));
      localStorage.setItem('bespoke_customer_profile', JSON.stringify(customerData));
      localStorage.setItem(`bespoke_customer_token_${tenantSlug}`, token);

      toast.success(`Authenticated as ${profile.name}`);
      await fetchBookings(token, customerData);
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Google authentication failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Request 6-digit OTP
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (!emailInput.trim() || !emailInput.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      setOtpSending(true);
      await api.post(`/tenants/${tenantSlug}/customer/auth/send-otp`, {
        email: emailInput.trim().toLowerCase(),
      });
      toast.success(`Verification code sent to ${emailInput.trim().toLowerCase()}`);
      setAuthStep('otp');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send verification code');
    } finally {
      setOtpSending(false);
    }
  };

  // Verify 6-digit OTP
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    if (!otpInput.trim() || otpInput.trim().length < 6) {
      toast.error('Please enter the 6-digit verification code');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post(`/tenants/${tenantSlug}/customer/auth/verify-otp`, {
        email: emailInput.trim().toLowerCase(),
        otp: otpInput.trim(),
      });

      const token = res.data.customerToken;
      const customerData = {
        name: emailInput.split('@')[0],
        email: emailInput.trim().toLowerCase(),
        picture: null,
      };

      setCustomer(customerData);
      setCustomerToken(token);
      localStorage.setItem(`bespoke_customer_profile_${tenantSlug}`, JSON.stringify(customerData));
      localStorage.setItem('bespoke_customer_profile', JSON.stringify(customerData));
      localStorage.setItem(`bespoke_customer_token_${tenantSlug}`, token);

      toast.success('Identity verified! Loading your reservations...');
      await fetchBookings(token, customerData);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid or expired verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    setCustomer(null);
    setCustomerToken('');
    setBookings([]);
    setAuthStep('email');
    setEmailInput('');
    setOtpInput('');
    localStorage.removeItem(`bespoke_customer_profile_${tenantSlug}`);
    localStorage.removeItem('bespoke_customer_profile');
    localStorage.removeItem(`bespoke_customer_token_${tenantSlug}`);
    localStorage.removeItem('bespoke_customer_token');
    toast.info('Signed out of customer portal');
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking? This slot will be released.')) {
      return;
    }

    try {
      setCancellingId(bookingId);
      await api.post(`/tenants/${tenantSlug}/customer/bookings/${bookingId}/cancel`, {}, {
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      });
      toast.success('Reservation cancelled successfully');
      await fetchBookings(customerToken);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel reservation');
    } finally {
      setCancellingId(null);
    }
  };

  if (!isOpen) return null;

  const now = new Date();
  const upcomingBookings = bookings.filter(b => 
    (b.status === 'CONFIRMED' && new Date(b.endTime) >= now) ||
    (b.status === 'PENDING' && new Date(b.createdAt).getTime() > Date.now() - 10 * 60 * 1000)
  );
  const pastBookings = bookings.filter(b => 
    (b.status === 'CONFIRMED' && new Date(b.endTime) < now) ||
    b.status === 'CANCELLED' ||
    (b.status === 'PENDING' && new Date(b.createdAt).getTime() <= Date.now() - 10 * 60 * 1000)
  );

  const displayedBookings = activeTab === 'upcoming' ? upcomingBookings : pastBookings;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 150,
      padding: '20px',
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        animation: 'fadeInUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#FAFAFA',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ticket size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                My Reservations
              </h3>
              <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>
                {tenantInfo?.name || 'Secure Customer Portal'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {!customerToken ? (
            /* Secure Authentication View */
            <div>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  backgroundColor: '#EFF6FF',
                  color: '#2563EB',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                }}>
                  <ShieldCheck size={28} />
                </div>
                <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 6px' }}>
                  Secure Customer Verification
                </h4>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                  To protect your booking privacy, verify your identity with Google or receive a one-time secure code.
                </p>
              </div>

              {/* Option 1: 1-Click Google Verification */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  padding: '12px 18px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#1E293B',
                  cursor: googleLoading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                  marginBottom: '20px',
                  transition: 'all 0.15s ease',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                {googleLoading ? 'Signing in with Google...' : 'Sign in with Google (1-Click)'}
              </button>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                margin: '20px 0',
                color: '#94A3B8',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#E2E8F0' }}></div>
                <span style={{ padding: '0 12px' }}>Or with Email Code</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#E2E8F0' }}></div>
              </div>

              {/* Option 2: Email OTP Step 1 (Send Code) */}
              {authStep === 'email' ? (
                <form onSubmit={handleSendOtp}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Customer Email Address
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="e.g. name@example.com"
                        style={{
                          width: '100%',
                          padding: '12px 14px 12px 40px',
                          borderRadius: '10px',
                          border: '1px solid #CBD5E1',
                          fontSize: '14px',
                          color: '#0F172A',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <Mail size={16} color="#94A3B8" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={otpSending}
                    style={{
                      width: '100%',
                      padding: '12px 18px',
                      backgroundColor: '#0F172A',
                      color: '#FFFFFF',
                      borderRadius: '10px',
                      border: 'none',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: otpSending ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {otpSending ? 'Sending verification code...' : 'Send 6-Digit Code'}
                    <ArrowRight size={16} />
                  </button>
                </form>
              ) : (
                /* Option 2: Email OTP Step 2 (Verify Code) */
                <form onSubmit={handleVerifyOtp}>
                  <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#F8FAFC',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Code sent to:</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{emailInput}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setAuthStep('email'); setOtpInput(''); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563EB',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Change
                    </button>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Enter 6-Digit Code
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        maxLength={6}
                        required
                        autoFocus
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        style={{
                          width: '100%',
                          padding: '12px 14px 12px 40px',
                          borderRadius: '10px',
                          border: '1px solid #CBD5E1',
                          fontSize: '18px',
                          fontFamily: 'monospace',
                          letterSpacing: '0.25em',
                          color: '#0F172A',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <KeyRound size={16} color="#94A3B8" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otpInput.length < 6}
                    style={{
                      width: '100%',
                      padding: '12px 18px',
                      backgroundColor: '#059669',
                      color: '#FFFFFF',
                      borderRadius: '10px',
                      border: 'none',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: (loading || otpInput.length < 6) ? 'not-allowed' : 'pointer',
                      opacity: (loading || otpInput.length < 6) ? 0.7 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      marginBottom: '12px',
                    }}
                  >
                    {loading ? 'Verifying...' : 'Verify & View My Bookings'}
                    <CheckCircle2 size={16} />
                  </button>

                  <div style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={otpSending}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748B',
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <RotateCcw size={12} />
                      {otpSending ? 'Resending...' : "Didn't receive code? Resend"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Authenticated Customer View */
            <div>
              {/* Profile Card & Logout */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                marginBottom: '20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: '#E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748B',
                    fontWeight: 700,
                    fontSize: '14px',
                  }}>
                    {customer?.name?.charAt(0).toUpperCase() || <User size={16} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                      {customer?.name || 'Verified Customer'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      {customer?.email}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'none',
                    border: '1px solid #E2E8F0',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#64748B',
                    cursor: 'pointer',
                  }}
                >
                  <LogOut size={12} /> Sign Out
                </button>
              </div>

              {/* Tabs */}
              <div style={{
                display: 'flex',
                borderBottom: '1px solid #E2E8F0',
                marginBottom: '16px',
              }}>
                <button
                  onClick={() => setActiveTab('upcoming')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === 'upcoming' ? '2px solid #0F172A' : '2px solid transparent',
                    color: activeTab === 'upcoming' ? '#0F172A' : '#64748B',
                    fontWeight: activeTab === 'upcoming' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Upcoming ({upcomingBookings.length})
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === 'history' ? '2px solid #0F172A' : '2px solid transparent',
                    color: activeTab === 'history' ? '#0F172A' : '#64748B',
                    fontWeight: activeTab === 'history' ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Past & Cancelled ({pastBookings.length})
                </button>
              </div>

              {/* Bookings List */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748B', fontSize: '13px' }}>
                  Loading your reservations...
                </div>
              ) : displayedBookings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64748B' }}>
                  <Calendar size={32} color="#94A3B8" style={{ margin: '0 auto 10px' }} />
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                    No {activeTab} bookings found
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                    {activeTab === 'upcoming' ? 'Select a time slot on the booking calendar to reserve.' : 'Your past booking history will appear here.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {displayedBookings.map((b) => {
                    const isConfirmed = b.status === 'CONFIRMED';
                    const isCancelled = b.status === 'CANCELLED';
                    const isPending = b.status === 'PENDING';
                    const isExpired = isPending && new Date(b.createdAt).getTime() <= Date.now() - 10 * 60 * 1000;
                    const isPassed = new Date(b.endTime) < now;

                    const dateFormatted = new Date(b.startTime).toLocaleDateString('en-US', {
                      timeZone: 'UTC',
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });

                    const displayTime = `${new Date(b.startTime).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true })} - ${new Date(b.endTime).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true })}`;

                    const gcalUrl = isConfirmed ? generateGoogleCalendarUrl({
                      title: `${b.resource?.name || 'Reservation'} at ${tenantInfo?.name || 'Booking'}`,
                      details: `Booking Reference: ${b.id}\nCustomer: ${customer?.name}`,
                      location: tenantInfo?.name || '',
                      startTime: b.startTime,
                      endTime: b.endTime,
                    }) : null;

                    return (
                      <div
                        key={b.id}
                        style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: '14px',
                          padding: '16px',
                          backgroundColor: '#FFFFFF',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                                {b.resource?.name || 'Reserved Resource'}
                              </h4>
                              {isCancelled ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  backgroundColor: '#FEE2E2',
                                  color: '#DC2626',
                                  fontWeight: '600',
                                }}>
                                  <XCircle size={12} /> Cancelled
                                </span>
                              ) : isExpired ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  backgroundColor: '#F1F5F9',
                                  color: '#64748B',
                                  fontWeight: '600',
                                }}>
                                  <Clock size={12} /> Expired Hold
                                </span>
                              ) : isPending ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  backgroundColor: '#FEF3C7',
                                  color: '#D97706',
                                  fontWeight: '600',
                                }}>
                                  <Clock size={12} /> Pending Payment
                                </span>
                              ) : isPassed ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  backgroundColor: '#F3F4F6',
                                  color: '#4B5563',
                                  fontWeight: '600',
                                }}>
                                  Completed
                                </span>
                              ) : (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  backgroundColor: '#DCFCE7',
                                  color: '#16A34A',
                                  fontWeight: '600',
                                }}>
                                  <CheckCircle2 size={12} /> Confirmed
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'monospace' }}>
                              Ref: {b.id.slice(0, 8).toUpperCase()}
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                              ₹{((b.totalAmountCents || 0) / 100).toLocaleString('en-IN')}
                            </div>
                            <div style={{ fontSize: '11px', color: isConfirmed ? '#16A34A' : '#64748B' }}>
                              {isConfirmed ? 'Paid in full' : isPending ? (isExpired ? 'Unpaid' : 'Pending') : 'Cancelled'}
                            </div>
                          </div>
                        </div>

                        {/* Slot info */}
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '16px',
                          padding: '10px 12px',
                          backgroundColor: '#F8FAFC',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#334155',
                          marginBottom: isConfirmed && !isPassed ? '10px' : '0',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar size={14} color="#2563EB" />
                            <span>{dateFormatted}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={14} color="#2563EB" />
                            <span>{displayTime}</span>
                          </div>
                        </div>

                        {/* Action Bar for Active Bookings */}
                        {isConfirmed && !isPassed && (
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            paddingTop: '8px',
                            borderTop: '1px solid #F1F5F9',
                          }}>
                            {gcalUrl && (
                              <a
                                href={gcalUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '12px',
                                  color: '#2563EB',
                                  textDecoration: 'none',
                                  fontWeight: 500,
                                }}
                              >
                                <ExternalLink size={12} /> Add to Calendar
                              </a>
                            )}

                            <button
                              onClick={() => handleCancelBooking(b.id)}
                              disabled={cancellingId === b.id}
                              style={{
                                fontSize: '12px',
                                padding: '5px 10px',
                                color: '#DC2626',
                                border: '1px solid #FCA5A5',
                                background: '#FEF2F2',
                                borderRadius: '6px',
                                fontWeight: 600,
                                cursor: cancellingId === b.id ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {cancellingId === b.id ? 'Cancelling...' : 'Cancel Reservation'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
