import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  ShieldCheck,
  User,
  Mail,
  Phone,
  FileText,
  Calendar,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Lock,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';

export default function BookingModal({
  isOpen,
  resource,
  slot,
  tenant,
  lockState,
  onClose,
  onProceedToPayment,
}) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
    rememberMe: true,
  });

  const [errors, setErrors] = useState({});
  const [step, setStep] = useState('details'); // 'details' | 'review'

  // Load remembered customer profile if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem('saas_customer_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        setFormData((prev) => ({
          ...prev,
          name: parsed.name || '',
          email: parsed.email || '',
          phone: parsed.phone || '',
        }));
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, []);

  if (!isOpen || !resource || !slot) return null;

  const hourlyRate = (resource.hourlyRateCents || 0) / 100;
  const currencySymbol = tenant?.currency === 'INR' ? '₹' : tenant?.currency === 'EUR' ? '€' : '$';
  const totalAmount = hourlyRate; // Standard 1-hour slot default

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Full name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (formData.phone && !/^[+0-9\s()-]{7,20}$/.test(formData.phone.trim())) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitDetails = (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Please complete all required fields properly');
      return;
    }

    if (formData.rememberMe) {
      try {
        localStorage.setItem(
          'saas_customer_profile',
          JSON.stringify({
            name: formData.name.trim(),
            email: formData.email.trim(),
            phone: formData.phone.trim(),
          })
        );
      } catch (err) {
        // Storage quota or private mode
      }
    }

    if (onProceedToPayment) {
      onProceedToPayment({
        ...formData,
        totalAmount,
      });
    } else {
      setStep('review');
    }
  };

  const handleCloseModal = () => {
    if (lockState?.releaseCurrentLock) {
      lockState.releaseCurrentLock();
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCloseModal();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border, #E2E8F0)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #F8FAFC, #FFFFFF)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: '#EEF2FF',
                  color: '#4F46E5',
                }}
              >
                {tenant?.name || 'Reservation'}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#059669',
                }}
              >
                <Lock size={12} /> Held for you
              </span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0F172A', margin: 0 }}>
              {resource.name}
            </h2>
          </div>

          <button
            onClick={handleCloseModal}
            aria-label="Close modal"
            style={{
              border: 'none',
              background: '#F1F5F9',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B',
              transition: 'background-color 0.15s',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Lock Timer Bar */}
        {lockState?.formattedTime && (
          <div
            style={{
              backgroundColor: '#EFF6FF',
              padding: '8px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#1E40AF',
              borderBottom: '1px solid #DBEAFE',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} className="animate-spin" />
              <span>Holding slot in Redis:</span>
            </div>
            <span style={{ fontFamily: 'monospace', fontWeight: '700' }}>
              {lockState.formattedTime}
            </span>
          </div>
        )}

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* Reservation Summary Box */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              border: '1px solid #E2E8F0',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Calendar size={18} style={{ color: '#6366F1', marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '11px', color: '#64748B', margin: 0, textTransform: 'uppercase' }}>Date</p>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A', margin: 0 }}>
                  {slot.date}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Clock size={18} style={{ color: '#6366F1', marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '11px', color: '#64748B', margin: 0, textTransform: 'uppercase' }}>Time Slot</p>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#0F172A', margin: 0 }}>
                  {slot.startTime} – {slot.endTime}
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmitDetails}>
            <div style={{ marginBottom: '18px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                <User size={14} /> Full Name <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errors.name) setErrors({ ...errors, name: null });
                }}
                placeholder="e.g. Alex Morgan"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${errors.name ? '#EF4444' : '#CBD5E1'}`,
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {errors.name && (
                <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px', margin: '4px 0 0' }}>
                  {errors.name}
                </p>
              )}
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                <Mail size={14} /> Email Address <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (errors.email) setErrors({ ...errors, email: null });
                }}
                placeholder="alex@example.com"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${errors.email ? '#EF4444' : '#CBD5E1'}`,
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {errors.email && (
                <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px', margin: '4px 0 0' }}>
                  {errors.email}
                </p>
              )}
              <p style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', margin: '4px 0 0' }}>
                Confirmation details and calendar invites will be dispatched to this inbox.
              </p>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                <Phone size={14} /> Phone Number <span style={{ fontSize: '11px', color: '#94A3B8' }}>(Optional)</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value });
                  if (errors.phone) setErrors({ ...errors, phone: null });
                }}
                placeholder="+1 (555) 000-0000"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${errors.phone ? '#EF4444' : '#CBD5E1'}`,
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {errors.phone && (
                <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px', margin: '4px 0 0' }}>
                  {errors.phone}
                </p>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                <FileText size={14} /> Special Requests or Notes <span style={{ fontSize: '11px', color: '#94A3B8' }}>(Optional)</span>
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="Any special setup requirements, equipment needs, or access notes..."
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Price Summary Breakdown */}
            <div
              style={{
                borderTop: '1px solid #E2E8F0',
                paddingTop: '16px',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', marginBottom: '6px' }}>
                <span>Rate per session</span>
                <span>{currencySymbol}{hourlyRate.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', marginBottom: '10px' }}>
                <span>Taxes & Booking Fees</span>
                <span>{currencySymbol}0.00</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '16px',
                  fontWeight: '700',
                  color: '#0F172A',
                  paddingTop: '8px',
                  borderTop: '1px dashed #E2E8F0',
                }}
              >
                <span>Total Amount Due</span>
                <span>{currencySymbol}{totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                color: '#475569',
                cursor: 'pointer',
                marginBottom: '24px',
              }}
            >
              <input
                type="checkbox"
                checked={formData.rememberMe}
                onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                style={{ borderRadius: '4px', cursor: 'pointer' }}
              />
              <span>Remember my contact information for future bookings</span>
            </label>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Release Hold
              </button>
              <button
                type="submit"
                style={{
                  flex: 2,
                  padding: '12px 20px',
                  backgroundColor: '#4F46E5',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)',
                }}
              >
                <span>Continue to Checkout</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
