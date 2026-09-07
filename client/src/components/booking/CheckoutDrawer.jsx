import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Clock, ShieldCheck, X, CreditCard, Sparkles, CheckCircle, CalendarPlus, Zap, QrCode, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { generateGoogleCalendarUrl } from '../../utils/calendar';
import { triggerGoogleOAuth } from '../../utils/googleAuth';

export default function CheckoutDrawer({
  resource,
  slot,
  tenant,
  lockState,
  onClose,
  onBookingSuccess,
}) {
  const [customerName, setCustomerName] = useState(() => {
    try {
      const saved = localStorage.getItem('bespoke_customer_profile');
      return saved ? JSON.parse(saved).name || '' : '';
    } catch (e) {
      return '';
    }
  });

  const [customerEmail, setCustomerEmail] = useState(() => {
    try {
      const saved = localStorage.getItem('bespoke_customer_profile');
      return saved ? JSON.parse(saved).email || '' : '';
    } catch (e) {
      return '';
    }
  });

  const [googleFilling, setGoogleFilling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [paymentMode, setPaymentMode] = useState('upi'); // 'upi' | 'razorpay'
  const [upiApp, setUpiApp] = useState('gpay'); // 'gpay' | 'phonepe' | 'paytm' | 'other'
  const [showQr, setShowQr] = useState(false);
  const [upiId, setUpiId] = useState('');


  const { formattedTime, isExpired, releaseCurrentLock, resetLockLocally } = lockState;

  const hourlyRate = resource.hourlyRateCents / 100;
  // 1-hour slot
  const totalAmount = hourlyRate;

  const handleGoogleAutofill = async () => {
    try {
      setGoogleFilling(true);
      const profile = await triggerGoogleOAuth();
      setCustomerName(profile.name);
      setCustomerEmail(profile.email);
      localStorage.setItem('bespoke_customer_profile', JSON.stringify({
        name: profile.name,
        email: profile.email.toLowerCase(),
        picture: profile.picture,
      }));
      toast.success(`Autofilled as ${profile.name}`);
    } catch (err) {
      toast.error(err.message || 'Google autofill was cancelled');
    } finally {
      setGoogleFilling(false);
    }
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleUpiPay = async (e) => {
    if (e) e.preventDefault();

    if (!customerName.trim() || !customerEmail.trim()) {
      toast.error('Please enter your full name and email address');
      return;
    }

    if (isExpired) {
      toast.error('Your reservation timer expired. Please select a slot again.');
      return;
    }

    try {
      setSubmitting(true);
      const startDt = `${slot.date}T${slot.startTime}:00.000Z`;
      const endDt = `${slot.date}T${slot.endTime}:00.000Z`;

      // 1. Create Pending Booking
      const bookingRes = await api.post('/bookings', {
        resourceId: resource.id,
        customerName,
        customerEmail,
        startTime: startDt,
        endTime: endDt,
        lockValue: lockState.lockValue,
      });

      const booking = bookingRes.data.booking;

      // 2. Confirm via UPI
      const appName = upiApp === 'gpay' ? 'Google Pay' : upiApp === 'phonepe' ? 'PhonePe' : upiApp === 'paytm' ? 'Paytm' : 'UPI';
      const defaultSuffix = upiApp === 'gpay' ? '@okhdfcbank' : upiApp === 'phonepe' ? '@ybl' : upiApp === 'paytm' ? '@paytm' : '@upi';
      const effectiveUpi = upiId.trim()
        ? (upiId.includes('@') ? upiId.trim() : `${upiId.trim()}${defaultSuffix}`)
        : `${customerEmail ? customerEmail.split('@')[0] : 'user'}${defaultSuffix}`;

      const upiRes = await api.post(`/bookings/${booking.id}/upi/confirm`, {
        upiId: effectiveUpi,
        upiApp: appName,
      });

      setConfirmedBooking(upiRes.data.booking);
      resetLockLocally();

      // Remember customer profile
      try {
        const existing = JSON.parse(localStorage.getItem('bespoke_customer_profile') || '{}');
        localStorage.setItem('bespoke_customer_profile', JSON.stringify({
          name: customerName,
          email: customerEmail.trim().toLowerCase(),
          picture: existing.picture || null,
        }));
      } catch (err) {}

      // Trigger celebratory confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      toast.success(upiRes.data.message || `Payment verified via ${appName} & reservation confirmed!`);
      if (onBookingSuccess) {
        onBookingSuccess(upiRes.data.booking);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to complete UPI payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();

    if (!customerName.trim() || !customerEmail.trim()) {
      toast.error('Please enter your full name and email address');
      return;
    }

    if (isExpired) {
      toast.error('Your reservation timer expired. Please select a slot again.');
      return;
    }

    try {
      setSubmitting(true);

      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        toast.error('Could not connect to Razorpay payment gateway. Check your internet connection.');
        setSubmitting(false);
        return;
      }

      const startDt = `${slot.date}T${slot.startTime}:00.000Z`;
      const endDt = `${slot.date}T${slot.endTime}:00.000Z`;

      // 1. Create Pending Booking
      const bookingRes = await api.post('/bookings', {
        resourceId: resource.id,
        customerName,
        customerEmail,
        startTime: startDt,
        endTime: endDt,
        lockValue: lockState.lockValue,
      });

      const booking = bookingRes.data.booking;

      // 2. Create Real Razorpay Order
      const orderRes = await api.post(`/bookings/${booking.id}/razorpay/create-order`);
      const { orderId, amount, keyId } = orderRes.data;

      // 3. Launch Razorpay Standard Checkout Popup
      const options = {
        key: keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: amount,
        currency: 'INR',
        name: tenant?.name || 'Bespoke Bookings',
        description: `Booking for ${resource.name}`,
        image: tenant?.logoUrl || undefined,
        order_id: orderId,
        prefill: {
          name: customerName,
          email: customerEmail,
        },
        theme: {
          color: '#0F172A',
        },
        handler: async function (response) {
          try {
            setSubmitting(true);
            // 4. Verify HMAC SHA-256 signature on backend
            const verifyRes = await api.post(`/bookings/${booking.id}/razorpay/verify`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            setConfirmedBooking(verifyRes.data.booking);
            resetLockLocally();

            // Remember customer for future visits & My Bookings
            try {
              const existing = JSON.parse(localStorage.getItem('bespoke_customer_profile') || '{}');
              localStorage.setItem('bespoke_customer_profile', JSON.stringify({
                name: customerName,
                email: customerEmail.trim().toLowerCase(),
                picture: existing.picture || null,
              }));
            } catch (e) {
              // ignore
            }

            // Trigger celebratory confetti
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
            });

            toast.success('Payment verified & reservation confirmed!');
            if (onBookingSuccess) {
              onBookingSuccess(verifyRes.data.booking);
            }
          } catch (err) {
            toast.error(err.response?.data?.error || 'Payment verification failed');
          } finally {
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: function () {
            setSubmitting(false);
            toast.info('Payment window closed. Your slot remains held.');
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        toast.error(`Payment failed: ${response.error?.description || 'Transaction declined'}`);
        setSubmitting(false);
      });
      rzp.open();

    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to initialize Razorpay checkout');
      setSubmitting(false);
    }
  };


  const handleCancel = async () => {
    await releaseCurrentLock();
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(23, 23, 23, 0.4)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px',
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '32px',
        position: 'relative',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
      }}>
        <button
          onClick={handleCancel}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
        >
          <X size={20} />
        </button>

        {confirmedBooking ? (
          /* Confirmation State */
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              width: '64px',
              height: '64px',
              backgroundColor: 'var(--success-bg)',
              color: 'var(--success)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle size={36} />
            </div>

            <h3 style={{ fontSize: '24px', marginBottom: '8px' }}>Reservation Confirmed!</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              A confirmation summary has been sent to <strong>{customerEmail}</strong>.
            </p>

            <div style={{
              backgroundColor: 'var(--bg-alt)',
              borderRadius: 'var(--radius-xs)',
              padding: '20px',
              textAlign: 'left',
              marginBottom: '20px',
              border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>BOOKING REFERENCE</span>
                <span className="mono" style={{ fontSize: '12px', fontWeight: '700' }}>
                  {confirmedBooking.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
                {resource.name}
              </div>
              <div className="mono" style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                {slot.date} &bull; {slot.startTime} – {slot.endTime}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Total Paid</span>
                <span className="mono" style={{ fontWeight: '700', color: 'var(--accent)' }}>
                  ₹{(confirmedBooking.totalAmountCents / 100).toFixed(2)} {tenant?.currency || 'INR'}
                </span>
              </div>
            </div>

            {/* Calendar Integration */}
            <div style={{ marginBottom: '24px', textAlign: 'left' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Add to Calendar
              </div>
              <a
                href={generateGoogleCalendarUrl({
                  title: `${resource.name} at ${tenant?.name || 'Booking'}`,
                  description: `Confirmed Reservation: ${confirmedBooking.id.slice(0, 8).toUpperCase()}\nSpace: ${resource.name}\nTime: ${slot.startTime} – ${slot.endTime}\nBusiness: ${tenant?.name || ''}`,
                  location: tenant?.address || tenant?.name || '',
                  date: slot.date,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  padding: '12px',
                  width: '100%',
                  textDecoration: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#1a73e8',
                  borderColor: '#dadce0',
                  fontWeight: '600',
                  boxSizing: 'border-box',
                }}
              >
                <CalendarPlus size={16} /> Add to Google Calendar
              </a>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Done & Return to Schedule
            </button>
          </div>
        ) : (
          /* Checkout State */
          <div>
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span className="badge badge-available">Selected Slot</span>
                <div className="lock-timer-pill">
                  <Clock size={14} /> Held for {formattedTime}
                </div>
              </div>

              <h3 style={{ fontSize: '22px', marginBottom: '4px' }}>{resource.name}</h3>
              <p className="mono" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {slot.date} &bull; {slot.startTime} to {slot.endTime} (1 Hour)
              </p>
            </div>

            <div style={{
              backgroundColor: 'var(--bg-alt)',
              padding: '16px 20px',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border)',
              marginBottom: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>TOTAL DUE</div>
                <div className="mono" style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  ₹{totalAmount.toFixed(2)} <span style={{ fontSize: '12px', fontWeight: '400' }}>{tenant?.currency || 'INR'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--success)' }}>
                <ShieldCheck size={16} /> Instant Confirmation
              </div>
            </div>

            {/* 1-Click Google Autofill */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              padding: '10px 14px',
              backgroundColor: '#F8FAFC',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Fast Checkout:</span>
              </div>
              <button
                type="button"
                onClick={handleGoogleAutofill}
                disabled={googleFilling}
                className="btn btn-outline"
                style={{
                  fontSize: '12px',
                  padding: '5px 12px',
                  backgroundColor: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderColor: '#CBD5E1',
                }}
              >
                <Zap size={13} color="#2563EB" />
                {googleFilling ? 'Connecting...' : '1-Click Autofill'}
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (paymentMode === 'upi') {
                handleUpiPay(e);
              } else {
                handleConfirm(e);
              }
            }}>
              <div style={{ marginBottom: '14px' }}>
                <label className="input-label">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jordan Sparks"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="input-field"
                  disabled={submitting || isExpired}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="input-label">Email Address (for Google Calendar &amp; receipt) *</label>
                <input
                  type="email"
                  required
                  placeholder="jordan@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="input-field"
                  disabled={submitting || isExpired}
                />
              </div>

              {/* Payment Method Selector */}
              <div style={{ marginBottom: '14px' }}>
                <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Choose Payment Method</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('upi')}
                    style={{
                      padding: '9px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: paymentMode === 'upi' ? '2px solid #059669' : '1px solid var(--border)',
                      backgroundColor: paymentMode === 'upi' ? '#ECFDF5' : '#FFFFFF',
                      color: paymentMode === 'upi' ? '#065F46' : 'var(--text-primary)',
                      fontWeight: 600,
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Zap size={14} color={paymentMode === 'upi' ? '#059669' : '#64748B'} />
                    <span>⚡ UPI &amp; QR Code</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('razorpay')}
                    style={{
                      padding: '9px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: paymentMode === 'razorpay' ? '2px solid #2563EB' : '1px solid var(--border)',
                      backgroundColor: paymentMode === 'razorpay' ? '#EFF6FF' : '#FFFFFF',
                      color: paymentMode === 'razorpay' ? '#1E40AF' : 'var(--text-primary)',
                      fontWeight: 600,
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <CreditCard size={14} color={paymentMode === 'razorpay' ? '#2563EB' : '#64748B'} />
                    <span>💳 Cards / Netbanking</span>
                  </button>
                </div>
              </div>

              {/* UPI & QR Details Sub-Card */}
              {paymentMode === 'upi' && (
                <div style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px',
                  marginBottom: '16px',
                }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#64748B',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: '8px'
                  }}>
                    Select UPI App:
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' }}>
                    {/* Google Pay */}
                    <button
                      type="button"
                      onClick={() => { setUpiApp('gpay'); setUpiId(''); }}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '6px',
                        border: upiApp === 'gpay' ? '2px solid #2563EB' : '1px solid #E2E8F0',
                        backgroundColor: upiApp === 'gpay' ? '#EFF6FF' : '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 800,
                        color: '#4285F4'
                      }}>
                        G
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: upiApp === 'gpay' ? 700 : 500, color: upiApp === 'gpay' ? '#1E40AF' : '#475569' }}>
                        Google Pay
                      </span>
                    </button>

                    {/* PhonePe */}
                    <button
                      type="button"
                      onClick={() => { setUpiApp('phonepe'); setUpiId(''); }}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '6px',
                        border: upiApp === 'phonepe' ? '2px solid #7C3AED' : '1px solid #E2E8F0',
                        backgroundColor: upiApp === 'phonepe' ? '#F5F3FF' : '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: '#5F259F',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 800,
                        color: '#FFFFFF'
                      }}>
                        पे
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: upiApp === 'phonepe' ? 700 : 500, color: upiApp === 'phonepe' ? '#6D28D9' : '#475569' }}>
                        PhonePe
                      </span>
                    </button>

                    {/* Paytm */}
                    <button
                      type="button"
                      onClick={() => { setUpiApp('paytm'); setUpiId(''); }}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '6px',
                        border: upiApp === 'paytm' ? '2px solid #0284C7' : '1px solid #E2E8F0',
                        backgroundColor: upiApp === 'paytm' ? '#F0F9FF' : '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '4px',
                        backgroundColor: '#002970',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: 800,
                        color: '#00BAF2'
                      }}>
                        Paytm
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: upiApp === 'paytm' ? 700 : 500, color: upiApp === 'paytm' ? '#0369A1' : '#475569' }}>
                        Paytm
                      </span>
                    </button>

                    {/* Other UPI / BHIM */}
                    <button
                      type="button"
                      onClick={() => { setUpiApp('other'); setUpiId(''); }}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '6px',
                        border: upiApp === 'other' ? '2px solid #059669' : '1px solid #E2E8F0',
                        backgroundColor: upiApp === 'other' ? '#ECFDF5' : '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: '#ECFDF5',
                        border: '1px solid #10B981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#059669'
                      }}>
                        <Zap size={14} />
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: upiApp === 'other' ? 700 : 500, color: upiApp === 'other' ? '#065F46' : '#475569' }}>
                        Other / QR
                      </span>
                    </button>
                  </div>

                  {/* App Specific Input & Quick Intent */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label className="input-label" style={{ fontSize: '11px', margin: 0 }}>
                        {upiApp === 'gpay' && 'Google Pay Number or UPI ID'}
                        {upiApp === 'phonepe' && 'PhonePe Mobile Number or UPI ID'}
                        {upiApp === 'paytm' && 'Paytm Mobile Number or UPI ID'}
                        {upiApp === 'other' && 'UPI Virtual ID (VPA)'}
                      </label>

                      {/* Mobile Intent Launch Helper */}
                      <a
                        href={`upi://pay?pa=${tenant?.slug || 'merchant'}@upi&pn=${encodeURIComponent(tenant?.name || 'Bespoke')}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Booking for ${resource.name}`)}`}
                        style={{
                          fontSize: '11px',
                          color: '#2563EB',
                          textDecoration: 'none',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                        title="Directly opens your installed UPI app on mobile"
                      >
                        📱 Open App
                      </a>
                    </div>

                    <input
                      type="text"
                      placeholder={
                        upiApp === 'gpay' ? 'e.g. 9876543210 or yourname@okhdfcbank' :
                        upiApp === 'phonepe' ? 'e.g. 9876543210 or yourname@ybl' :
                        upiApp === 'paytm' ? 'e.g. 9876543210 or yourname@paytm' :
                        'e.g. yourname@upi'
                      }
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className="input-field"
                      style={{ fontSize: '13px', padding: '7px 10px', marginBottom: '6px' }}
                    />

                    {/* Quick Handle Chips */}
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: '#64748B' }}>Quick handles:</span>
                      {(
                        upiApp === 'gpay' ? ['@okhdfcbank', '@okaxis', '@oksbi', '@okicici'] :
                        upiApp === 'phonepe' ? ['@ybl', '@ibl', '@axl'] :
                        upiApp === 'paytm' ? ['@paytm'] :
                        ['@upi', '@oksbi', '@icici', '@barodampay']
                      ).map((handle) => (
                        <button
                          key={handle}
                          type="button"
                          onClick={() => {
                            const prefix = upiId.includes('@') ? upiId.split('@')[0] : upiId || (customerEmail ? customerEmail.split('@')[0] : '9876543210');
                            setUpiId(`${prefix}${handle}`);
                          }}
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#475569',
                            cursor: 'pointer',
                          }}
                        >
                          {handle}
                        </button>
                      ))}
                    </div>

                    {/* Compact toggle for QR code */}
                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #E2E8F0', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setShowQr(!showQr)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '11px',
                          color: '#64748B',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {showQr ? '▲ Hide QR Code' : '▼ Or scan QR Code on desktop'}
                      </button>

                      {showQr && (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${tenant?.slug || 'merchant'}@upi&pn=${tenant?.name || 'Bespoke'}&am=${totalAmount.toFixed(2)}&cu=INR`)}`}
                            alt="UPI QR Code"
                            style={{ width: '110px', height: '110px', padding: '6px', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}
                          />
                          <span style={{ fontSize: '10px', color: '#64748B', marginTop: '4px' }}>Scan with any phone camera or UPI app</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tenant?.cancellationPolicy && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  marginBottom: '16px',
                  lineHeight: '1.4',
                  backgroundColor: 'var(--bg-alt)',
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border)',
                }}>
                  🛡️ <strong>Policy:</strong> {tenant.cancellationPolicy}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="btn btn-outline"
                  style={{ flex: '1' }}
                  disabled={submitting}
                >
                  Cancel Hold
                </button>

                {paymentMode === 'upi' ? (
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{
                      flex: '2',
                      backgroundColor: upiApp === 'gpay' ? '#1A73E8' : upiApp === 'phonepe' ? '#6739B7' : upiApp === 'paytm' ? '#00BAF2' : '#059669',
                      borderColor: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      color: '#FFFFFF',
                      fontWeight: 600,
                    }}
                    disabled={submitting || isExpired}
                  >
                    <Zap size={15} />
                    {submitting ? 'Confirming...' : `Pay ₹${totalAmount.toFixed(2)} via ${upiApp === 'gpay' ? 'Google Pay' : upiApp === 'phonepe' ? 'PhonePe' : upiApp === 'paytm' ? 'Paytm' : 'UPI'}`}
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{
                      flex: '2',
                      backgroundColor: '#0C2340',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      color: '#FFFFFF',
                      fontWeight: 600,
                    }}
                    disabled={submitting || isExpired}
                  >
                    <CreditCard size={15} />
                    {submitting ? 'Connecting Gateway...' : `Pay ₹${totalAmount.toFixed(2)} via Razorpay`}
                  </button>
                )}
              </div>

              <div style={{
                marginTop: '12px',
                textAlign: 'center',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}>
                <span>🔒 Secure checkout &bull; Instant confirmation &bull; 100% Verified</span>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
