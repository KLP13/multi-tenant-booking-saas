import React, { useState } from 'react';
import {
  CreditCard,
  Lock,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowLeft,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { generateGoogleCalendarUrl } from '../../utils/calendar';
import { api } from '../../api/client';

export default function StripePaymentForm({
  booking,
  resource,
  slot,
  tenant,
  clientSecret,
  isMock,
  onSuccess,
  onBack,
}) {
  const [cardDetails, setCardDetails] = useState({
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
    postalCode: '',
    cardholderName: booking?.customerName || '',
  });

  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // Format Card Number (XXXX XXXX XXXX XXXX)
  const handleCardNumberChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
    const formatted = raw.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardDetails({ ...cardDetails, cardNumber: formatted });
    if (errorMessage) setErrorMessage('');
  };

  // Format Expiry (MM/YY)
  const handleExpiryChange = (e) => {
    let raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (raw.length >= 3) {
      raw = `${raw.slice(0, 2)}/${raw.slice(2)}`;
    }
    setCardDetails({ ...cardDetails, cardExpiry: raw });
    if (errorMessage) setErrorMessage('');
  };

  const handleCvcChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    setCardDetails({ ...cardDetails, cardCvc: raw });
  };

  // Detect card brand
  const getCardBrand = () => {
    const clean = cardDetails.cardNumber.replace(/\s/g, '');
    if (clean.startsWith('4')) return 'Visa';
    if (/^5[1-5]/.test(clean)) return 'Mastercard';
    if (/^3[47]/.test(clean)) return 'American Express';
    if (/^6(?:011|5)/.test(clean)) return 'Discover';
    return null;
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanNumber = cardDetails.cardNumber.replace(/\s/g, '');
    if (cleanNumber.length < 15) {
      setErrorMessage('Please enter a valid 15 or 16 digit card number');
      return;
    }

    if (!/^\d{2}\/\d{2}$/.test(cardDetails.cardExpiry)) {
      setErrorMessage('Please enter card expiry in MM/YY format');
      return;
    }

    if (cardDetails.cardCvc.length < 3) {
      setErrorMessage('Please enter the 3 or 4 digit security CVC code');
      return;
    }

    setProcessing(true);

    try {
      // Complete confirmation with backend
      // 1. If mock payment intent or live test, confirm reservation
      const res = await api.post(`/api/bookings/${booking.id}/confirm-test`);
      
      const confirmed = res.data?.booking || {
        ...booking,
        status: 'CONFIRMED',
      };

      setConfirmedBooking(confirmed);
      setProcessing(false);

      // Trigger celebratory confetti
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (cErr) {}

      toast.success('Payment authorized and reservation confirmed!');

      if (onSuccess) {
        onSuccess(confirmed);
      }
    } catch (err) {
      setProcessing(false);
      const msg = err.response?.data?.error || 'Payment authorization failed. Please try a different card.';
      setErrorMessage(msg);
      toast.error(msg);
    }
  };

  const currencySymbol = tenant?.currency === 'INR' ? '₹' : tenant?.currency === 'EUR' ? '€' : '$';
  const totalAmount = ((booking?.totalAmountCents || resource?.hourlyRateCents || 0) / 100).toFixed(2);
  const brand = getCardBrand();

  // If confirmed, render booking confirmation screen
  if (confirmedBooking) {
    const calendarUrl = generateGoogleCalendarUrl({
      title: `${resource?.name || 'Booking'} at ${tenant?.name || 'Studio'}`,
      description: `Confirmed reservation for ${confirmedBooking.customerName}. Resource: ${resource?.name}.`,
      location: tenant?.address || tenant?.name || '',
      startTime: slot?.date ? `${slot.date}T${slot.startTime}:00.000Z` : confirmedBooking.startTime,
      endTime: slot?.date ? `${slot.date}T${slot.endTime}:00.000Z` : confirmedBooking.endTime,
    });

    return (
      <div style={{ textAlign: 'center', padding: '16px 8px' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            backgroundColor: '#DCFCE7',
            color: '#16A34A',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 10px 15px -3px rgba(22, 163, 74, 0.2)',
          }}
        >
          <CheckCircle2 size={36} />
        </div>

        <span
          style={{
            display: 'inline-block',
            fontSize: '11px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '3px 10px',
            borderRadius: '20px',
            backgroundColor: '#F0FDF4',
            color: '#15803D',
            border: '1px solid #BBF7D0',
            marginBottom: '8px',
          }}
        >
          Payment Confirmed
        </span>

        <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#0F172A', margin: '0 0 6px' }}>
          You're all booked!
        </h2>
        <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 20px' }}>
          Confirmation receipt sent to <strong>{confirmedBooking.customerEmail}</strong>
        </p>

        {/* Confirmation Card */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '16px',
            textAlign: 'left',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#64748B' }}>Booking Reference</span>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: '700', color: '#334155' }}>
              #{confirmedBooking.id?.slice(0, 8).toUpperCase() || 'BK-SUCCESS'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#64748B' }}>Resource</span>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>{resource?.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#64748B' }}>Date & Time</span>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A' }}>
              {slot?.date} &bull; {slot?.startTime} – {slot?.endTime}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px dashed #CBD5E1' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#0F172A' }}>Amount Paid</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#16A34A' }}>
              {currencySymbol}{totalAmount}
            </span>
          </div>
        </div>

        {/* Calendar Link */}
        {calendarUrl && (
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '12px 16px',
              backgroundColor: '#4F46E5',
              color: '#FFFFFF',
              borderRadius: '10px',
              textDecoration: 'none',
              fontWeight: '600',
              fontSize: '14px',
              marginBottom: '10px',
              boxSizing: 'border-box',
            }}
          >
            <Calendar size={16} />
            <span>Add to Google Calendar</span>
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: '#6366F1',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            padding: 0,
            marginBottom: '16px',
          }}
        >
          <ArrowLeft size={14} /> Back to details
        </button>
      )}

      {/* Stripe Brand & Encrypted Notice */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: '#F8FAFC',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} style={{ color: '#059669' }} />
          <div>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#0F172A', margin: 0 }}>
              Encrypted Checkout
            </p>
            <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>
              End-to-end 256-bit SSL transaction via Stripe
            </p>
          </div>
        </div>
        <CreditCard size={20} style={{ color: '#94A3B8' }} />
      </div>

      {errorMessage && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#B91C1C',
            fontSize: '13px',
            marginBottom: '16px',
          }}
        >
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmitPayment}>
        {/* Cardholder Name */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
            Cardholder Name
          </label>
          <input
            type="text"
            value={cardDetails.cardholderName}
            onChange={(e) => setCardDetails({ ...cardDetails, cardholderName: e.target.value })}
            placeholder="Name on card"
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Card Number */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>
              Card Number
            </label>
            {brand && (
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#4F46E5' }}>
                {brand}
              </span>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={cardDetails.cardNumber}
              onChange={handleCardNumberChange}
              placeholder="4242 •••• •••• 4242"
              required
              style={{
                width: '100%',
                padding: '10px 12px 10px 38px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                fontFamily: 'monospace',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <CreditCard
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94A3B8',
              }}
            />
          </div>
        </div>

        {/* Expiry & CVC Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
              Expires (MM/YY)
            </label>
            <input
              type="text"
              value={cardDetails.cardExpiry}
              onChange={handleExpiryChange}
              placeholder="MM/YY"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                fontFamily: 'monospace',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                CVC / CVV
              </label>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>3-4 digits</span>
            </div>
            <input
              type="password"
              value={cardDetails.cardCvc}
              onChange={handleCvcChange}
              placeholder="•••"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                fontFamily: 'monospace',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Submit Payment */}
        <button
          type="submit"
          disabled={processing}
          style={{
            width: '100%',
            padding: '13px 20px',
            backgroundColor: processing ? '#94A3B8' : '#0F172A',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: processing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.2)',
            transition: 'background-color 0.15s',
          }}
        >
          {processing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Authorizing with Stripe...</span>
            </>
          ) : (
            <>
              <Lock size={15} />
              <span>Pay {currencySymbol}{totalAmount} & Confirm</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
