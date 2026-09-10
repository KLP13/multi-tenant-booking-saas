import React, { useState } from 'react';
import { KeyRound, Mail, Lock, X, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/client';

export default function ForgotPasswordModal({ isOpen, onClose, initialEmail = '', tenantSlug = '' }) {
  const [step, setStep] = useState(1); // 1 = Request Code, 2 = Verify Code & Set Password
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSendCode = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      toast.error('Please enter your email address');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/forgot-password', {
        email: cleanEmail,
        tenantSlug: tenantSlug || undefined,
      });
      toast.success(res.data.message || 'Verification code sent!');
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!otp.trim()) {
      toast.error('Please enter the 6-digit verification code');
      return;
    }
    if (!newPassword) {
      toast.error('Please enter a new password');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        newPassword,
        tenantSlug: tenantSlug || undefined,
      });

      toast.success(res.data.message || 'Password successfully updated!');
      setStep(1);
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(23, 23, 23, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm, 4px)',
          width: '100%',
          maxWidth: '440px',
          padding: '32px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-xs, 2px)',
              backgroundColor: 'var(--bg-alt, #F5EFE6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent, #C1502E)',
            }}
          >
            <KeyRound size={20} />
          </div>
          <h3 style={{ fontSize: '20px', fontFamily: 'var(--font-serif)', margin: 0, color: 'var(--text-primary)' }}>
            Reset Password
          </h3>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
          {step === 1
            ? 'Enter your registered email address and we will dispatch a 6-digit verification code.'
            : `Enter the 6-digit code sent to ${email} and create a new password.`}
        </p>

        {step === 1 ? (
          <form onSubmit={handleSendCode}>
            <div style={{ marginBottom: '20px' }}>
              <label className="input-label">Email Address *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  required
                  placeholder="admin@yourbusiness.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '34px' }}
                  disabled={loading}
                  autoFocus
                />
                <Mail
                  size={15}
                  style={{ position: 'absolute', left: '11px', top: '13px', color: 'var(--text-secondary)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-outline"
                style={{ flex: 1 }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 2 }}
                disabled={loading}
              >
                {loading ? 'Sending Code...' : 'Send Code'} <ArrowRight size={15} />
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="input-label" style={{ marginBottom: 0 }}>6-Digit Verification Code *</label>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0,
                  }}
                >
                  <ArrowLeft size={12} /> Change Email
                </button>
              </div>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                className="input-field mono"
                style={{
                  fontSize: '20px',
                  letterSpacing: '8px',
                  textAlign: 'center',
                  fontWeight: 600,
                  padding: '10px',
                }}
                disabled={loading}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label className="input-label">New Password *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '34px' }}
                  disabled={loading}
                />
                <Lock
                  size={15}
                  style={{ position: 'absolute', left: '11px', top: '13px', color: 'var(--text-secondary)' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label className="input-label">Confirm New Password *</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  required
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '34px' }}
                  disabled={loading}
                />
                <Lock
                  size={15}
                  style={{ position: 'absolute', left: '11px', top: '13px', color: 'var(--text-secondary)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn btn-outline"
                style={{ flex: 1 }}
                disabled={loading}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 2 }}
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update Password'} <Check size={15} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
