import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Clock, ShieldCheck, X, CreditCard, Sparkles, CheckCircle, CalendarPlus, Zap, QrCode, Smartphone, User, Mail, ArrowRight, AlertTriangle } from 'lucide-react';
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
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);

  const { formattedTime, isExpired, releaseCurrentLock, resetLockLocally } = lockState;

  const hourlyRate = (resource?.hourlyRateCents || 0) / 100;
  
  // Calculate continuous duration in hours
  let durationHours = 1;
  if (slot?.durationMinutes) {
    durationHours = slot.durationMinutes / 60;
  } else if (slot?.startTime && slot?.endTime) {
    const [sh, sm] = slot.startTime.split(':').map(Number);
    const [eh, em] = slot.endTime.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins > 0) durationHours = mins / 60;
  }
  const totalAmount = hourlyRate * durationHours;

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

      const generatedUtr = `UPI_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const upiRes = await api.post(`/bookings/${booking.id}/upi/confirm`, {
        upiId: effectiveUpi,
        upiApp: appName,
        utr: generatedUtr,
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

            try {
              const existing = JSON.parse(localStorage.getItem('bespoke_customer_profile') || '{}');
              localStorage.setItem('bespoke_customer_profile', JSON.stringify({
                name: customerName,
                email: customerEmail.trim().toLowerCase(),
                picture: existing.picture || null,
              }));
            } catch (e) {}

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
    } finally {
      setSubmitting(false);
    }
  };

  const handleXClick = () => {
    if (confirmedBooking) {
      onClose();
      return;
    }
    setShowConfirmClose(true);
  };

  const handleConfirmRelease = async () => {
    try {
      setIsReleasing(true);
      await releaseCurrentLock();
      setShowConfirmClose(false);
      onClose();
      toast.info('Reservation cancelled and slot released');
    } catch (err) {
      console.error('Error releasing slot lock:', err);
      setShowConfirmClose(false);
      onClose();
    } finally {
      setIsReleasing(false);
    }
  };

  const appDisplayNames = {
    gpay: 'Google Pay',
    phonepe: 'PhonePe',
    paytm: 'Paytm',
    other: 'UPI',
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '16px',
      overflowY: 'auto',
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '540px',
        position: 'relative',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
        animation: 'fadeInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Top Header Bar */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#FAFAFA',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isExpired ? '#EF4444' : slot?.isHolding ? '#3B82F6' : '#10B981',
              boxShadow: isExpired ? 'none' : slot?.isHolding ? '0 0 0 4px rgba(59, 130, 246, 0.25)' : '0 0 0 3px rgba(16, 185, 129, 0.2)',
              transition: 'all 0.3s ease',
            }}></span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: isExpired ? '#DC2626' : slot?.isHolding ? '#2563EB' : '#047857' }}>
              {isExpired ? 'Reservation Expired' : slot?.isHolding ? 'Securing slot reservation...' : `Slot Held for ${formattedTime}`}
            </span>
          </div>

          <button
            onClick={handleXClick}
            type="button"
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
              transition: 'all 0.15s ease',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {confirmedBooking ? (
          /* Confirmation State */
          <div style={{ padding: '36px 28px', textAlign: 'center' }}>
            <div style={{
              width: '68px',
              height: '68px',
              backgroundColor: '#ECFDF5',
              color: '#059669',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 0 0 8px rgba(16, 185, 129, 0.1)',
            }}>
              <CheckCircle size={38} />
            </div>

            <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
              Booking Confirmed!
            </h3>
            <p style={{ color: '#64748B', fontSize: '14px', marginBottom: '24px', maxWidth: '380px', margin: '0 auto 24px' }}>
              We've reserved your slot and sent the booking receipt to <strong>{customerEmail}</strong>.
            </p>

            {/* Receipt Summary Card */}
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '12px',
              padding: '20px',
              textAlign: 'left',
              marginBottom: '20px',
              border: '1px solid #E2E8F0',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748B' }}>
                  Booking Reference
                </span>
                <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                  #{confirmedBooking.id.slice(0, 8).toUpperCase()}
                </span>
              </div>

              <div style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>
                {resource.name}
              </div>
              <div className="mono" style={{ fontSize: '13px', color: '#64748B', marginBottom: '12px' }}>
                {slot.date} &bull; {slot.startTime} to {slot.endTime} ({durationHours > 1 ? `${durationHours} Hours` : '1 Hour'})
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px dashed #CBD5E1' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748B' }}>Amount Paid</span>
                <span className="mono" style={{ fontSize: '18px', fontWeight: 700, color: '#059669' }}>
                  ₹{(confirmedBooking.totalAmountCents / 100).toFixed(2)} {tenant?.currency || 'INR'}
                </span>
              </div>
            </div>

            {/* Google Calendar Link */}
            <a
              href={generateGoogleCalendarUrl({
                title: `${resource.name} at ${tenant?.name || 'Booking'}`,
                description: `Confirmed Reservation: ${confirmedBooking.id.slice(0, 8).toUpperCase()}\nItem: ${resource.name}\nTime: ${slot.startTime} to ${slot.endTime}\nBusiness: ${tenant?.name || ''}`,
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
                padding: '11px',
                width: '100%',
                textDecoration: 'none',
                backgroundColor: '#FFFFFF',
                color: '#1A73E8',
                borderColor: '#DADCE0',
                fontWeight: 600,
                borderRadius: '10px',
                marginBottom: '12px',
              }}
            >
              <CalendarPlus size={16} /> Add to Google Calendar
            </a>

            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', borderRadius: '10px', fontWeight: 600 }}
            >
              Done & Return to Schedule
            </button>
          </div>
        ) : (
          /* Checkout State */
          <div style={{ padding: '24px 28px' }}>
            {/* Item & Price Summary Card */}
            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '16px 20px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    {resource.name}
                  </h3>
                  <div className="mono" style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    {slot.date} &bull; {slot.startTime} – {slot.endTime}
                  </div>
                </div>
                <span style={{
                  backgroundColor: '#EFF6FF',
                  color: '#1D4ED8',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '20px',
                  border: '1px solid #DBEAFE',
                }}>
                  {durationHours > 1 ? `${durationHours} Hours Block` : '1 Hour Slot'}
                </span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '10px',
                borderTop: '1px solid #E2E8F0',
                marginTop: '10px',
              }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: '#64748B' }}>
                    Total Due ({durationHours}h @ ₹{hourlyRate.toFixed(2)}/hr)
                  </div>
                  <div className="mono" style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A' }}>
                    ₹{totalAmount.toFixed(2)} <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748B' }}>{tenant?.currency || 'INR'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: '#059669' }}>
                  <ShieldCheck size={16} /> Instant Confirmation
                </div>
              </div>
            </div>

            {/* Google 1-Click Autofill Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              backgroundColor: '#F1F5F9',
              borderRadius: '10px',
              marginBottom: '18px',
              border: '1px solid #E2E8F0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                  Have a Google account?
                </span>
              </div>
              <button
                type="button"
                onClick={handleGoogleAutofill}
                disabled={googleFilling}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: '#FFFFFF',
                  color: '#2563EB',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                }}
              >
                <Zap size={13} fill="#2563EB" />
                {googleFilling ? 'Connecting...' : '1-Click Fill'}
              </button>
            </div>

            {/* Main Form */}
            <form onSubmit={(e) => {
              e.preventDefault();
              if (paymentMode === 'upi') {
                handleUpiPay(e);
              } else {
                handleConfirm(e);
              }
            }}>
              {/* Customer Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="input-label" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: '#64748B' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="input-field"
                    style={{ padding: '9px 12px', fontSize: '13px', borderRadius: '8px' }}
                    disabled={submitting || isExpired || slot?.isHolding}
                  />
                </div>
                <div>
                  <label className="input-label" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: '#64748B' }}>
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. ramesh@example.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="input-field"
                    style={{ padding: '9px 12px', fontSize: '13px', borderRadius: '8px' }}
                    disabled={submitting || isExpired}
                  />
                </div>
              </div>

              {/* Payment Method Selector Tabs */}
              <div style={{ marginBottom: '14px' }}>
                <label className="input-label" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: '#64748B', marginBottom: '6px', display: 'block' }}>
                  Select Payment Method
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('upi')}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      border: paymentMode === 'upi' ? '2px solid #059669' : '1px solid #E2E8F0',
                      backgroundColor: paymentMode === 'upi' ? '#ECFDF5' : '#FFFFFF',
                      color: paymentMode === 'upi' ? '#065F46' : '#334155',
                      fontWeight: 700,
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
                    <span>Instant UPI &amp; QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMode('razorpay')}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      border: paymentMode === 'razorpay' ? '2px solid #2563EB' : '1px solid #E2E8F0',
                      backgroundColor: paymentMode === 'razorpay' ? '#EFF6FF' : '#FFFFFF',
                      color: paymentMode === 'razorpay' ? '#1E40AF' : '#334155',
                      fontWeight: 700,
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
                    <span>Cards &amp; Netbanking</span>
                  </button>
                </div>
              </div>

              {/* UPI Sub-Options */}
              {paymentMode === 'upi' ? (
                <div style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '18px',
                  border: '1px solid #E2E8F0',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>
                      Choose UPI App
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowQr(!showQr)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563EB',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <QrCode size={12} /> {showQr ? 'Hide QR Code' : 'Scan via QR Code'}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
                    {[
                      { id: 'gpay', label: 'GPay' },
                      { id: 'phonepe', label: 'PhonePe' },
                      { id: 'paytm', label: 'Paytm' },
                      { id: 'other', label: 'Any UPI' },
                    ].map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => setUpiApp(app.id)}
                        style={{
                          padding: '6px 2px',
                          borderRadius: '6px',
                          border: upiApp === app.id ? '1px solid #059669' : '1px solid #CBD5E1',
                          backgroundColor: upiApp === app.id ? '#059669' : '#FFFFFF',
                          color: upiApp === app.id ? '#FFFFFF' : '#334155',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {app.label}
                      </button>
                    ))}
                  </div>

                  {/* Dynamic QR Code Modal / View */}
                  {showQr && (
                    <div style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      padding: '12px',
                      textAlign: 'center',
                      marginTop: '8px',
                      marginBottom: '8px',
                    }}>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${tenant?.slug || 'merchant'}@upi&pn=${tenant?.name || 'Bespoke'}&am=${totalAmount.toFixed(2)}&cu=INR`)}`}
                        alt="UPI QR Code"
                        style={{ width: '100px', height: '100px', display: 'block', margin: '0 auto 6px' }}
                      />
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        Scan with GPay, PhonePe, Paytm or Any Banking App
                      </div>
                    </div>
                  )}

                  <div>
                    <input
                      type="text"
                      placeholder={`Enter UPI ID (optional, defaults to ${customerEmail ? customerEmail.split('@')[0] : 'user'}@${upiApp === 'gpay' ? 'okhdfcbank' : upiApp === 'phonepe' ? 'ybl' : upiApp === 'paytm' ? 'paytm' : 'upi'})`}
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className="input-field"
                      style={{ padding: '7px 10px', fontSize: '11px', backgroundColor: '#FFFFFF', borderRadius: '6px' }}
                      disabled={submitting || isExpired}
                    />
                  </div>
                </div>
              ) : (
                <div style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '18px',
                  border: '1px solid #E2E8F0',
                  fontSize: '12px',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <CreditCard size={18} color="#2563EB" />
                  <span>Supports Visa, Mastercard, RuPay, Netbanking &amp; Popular Wallets via Razorpay.</span>
                </div>
              )}

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={submitting || isExpired}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  backgroundColor: paymentMode === 'upi' ? '#059669' : '#0F172A',
                  border: 'none',
                  cursor: submitting || isExpired ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.15s ease',
                  opacity: submitting || isExpired ? 0.7 : 1,
                }}
              >
                {submitting ? (
                  <span>Processing Reservation...</span>
                ) : (
                  <>
                    <Zap size={16} />
                    <span>Pay ₹{totalAmount.toFixed(2)} &amp; Confirm ({paymentMode === 'upi' ? appDisplayNames[upiApp] : 'Razorpay'})</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>

              <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '11px', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <ShieldCheck size={13} color="#10B981" />
                <span>256-Bit SSL Encrypted &bull; No Hidden Fees &bull; Instant Confirmation</span>
              </div>
            </form>
          </div>
        )}
        {/* Confirmation Dialog Modal Box */}
        {showConfirmClose && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px',
            animation: 'fadeIn 0.2s ease-out',
          }}>
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              maxWidth: '430px',
              width: '100%',
              padding: '28px 24px 24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              textAlign: 'center',
              animation: 'scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#FEF2F2',
                color: '#DC2626',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '18px',
                boxShadow: '0 0 0 8px #FEE2E2',
              }}>
                <AlertTriangle size={28} />
              </div>

              <h3 style={{
                fontSize: '19px',
                fontWeight: 700,
                color: '#0F172A',
                margin: '0 0 8px',
              }}>
                Do you really want to cancel?
              </h3>

              <p style={{
                fontSize: '14px',
                color: '#64748B',
                margin: '0 0 24px',
                lineHeight: 1.55,
              }}>
                Leaving now will release your held reservation for <strong style={{ color: '#0F172A' }}>{slot?.startTime} – {slot?.endTime}</strong> ({resource?.name || 'slot'}). Another customer will be able to book it immediately.
              </p>

              <div style={{
                display: 'flex',
                gap: '12px',
              }}>
                <button
                  type="button"
                  onClick={() => setShowConfirmClose(false)}
                  disabled={isReleasing}
                  style={{
                    flex: 1,
                    padding: '12px 18px',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC',
                    color: '#334155',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                >
                  No, Keep Slot
                </button>

                <button
                  type="button"
                  onClick={handleConfirmRelease}
                  disabled={isReleasing}
                  style={{
                    flex: 1,
                    padding: '12px 18px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: isReleasing ? 'not-allowed' : 'pointer',
                    opacity: isReleasing ? 0.7 : 1,
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isReleasing) e.currentTarget.style.backgroundColor = '#B91C1C';
                  }}
                  onMouseLeave={(e) => {
                    if (!isReleasing) e.currentTarget.style.backgroundColor = '#DC2626';
                  }}
                >
                  {isReleasing ? 'Releasing...' : 'Yes, Release Slot'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
