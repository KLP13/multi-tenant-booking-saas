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
  Ticket
} from 'lucide-react';
import { toast } from 'sonner';

export default function CustomerBookingsModal({ tenantSlug, isOpen, onClose }) {
  const [customer, setCustomer] = useState(() => {
    try {
      const saved = localStorage.getItem('bespoke_customer_profile');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'history'
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (isOpen && customer?.email) {
      fetchBookings(customer.email);
    }
  }, [isOpen, customer?.email, tenantSlug]);

  const fetchBookings = async (email) => {
    try {
      setLoading(true);
      const res = await api.get(`/tenants/${tenantSlug}/customer/bookings?email=${encodeURIComponent(email)}`);
      setBookings(res.data.bookings || []);
      setTenantInfo(res.data.tenant || null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load reservations');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      const profile = await triggerGoogleOAuth();
      const customerData = {
        name: profile.name,
        email: profile.email.toLowerCase(),
        picture: profile.picture,
      };
      setCustomer(customerData);
      localStorage.setItem('bespoke_customer_profile', JSON.stringify(customerData));
      toast.success(`Signed in as ${profile.name}`);
      await fetchBookings(customerData.email);
    } catch (err) {
      toast.error(err.message || 'Google authentication failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailLookup = async (e) => {
    e.preventDefault();
    if (!emailInput.trim() || !emailInput.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    const customerData = {
      name: emailInput.split('@')[0],
      email: emailInput.trim().toLowerCase(),
      picture: null,
    };
    setCustomer(customerData);
    localStorage.setItem('bespoke_customer_profile', JSON.stringify(customerData));
    await fetchBookings(customerData.email);
  };

  const handleSignOut = () => {
    setCustomer(null);
    setBookings([]);
    localStorage.removeItem('bespoke_customer_profile');
    toast.info('Signed out of customer portal');
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking? This slot will be released.')) {
      return;
    }

    try {
      setCancellingId(bookingId);
      await api.post(`/tenants/${tenantSlug}/customer/bookings/${bookingId}/cancel`, {
        email: customer.email,
      });
      toast.success('Reservation cancelled successfully');
      // Refresh list
      await fetchBookings(customer.email);
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
      backgroundColor: 'rgba(23, 23, 23, 0.55)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 150,
      padding: '20px',
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-secondary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'var(--accent)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ticket size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '17px', margin: 0, fontWeight: '600' }}>
                My Reservations
              </h3>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                View, manage, and download booking receipts
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {!customer ? (
            /* Auth screen if not logged in */
            <div style={{ maxWidth: '440px', margin: '20px auto', textAlign: 'center' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <Sparkles size={28} />
              </div>

              <h4 style={{ fontSize: '20px', marginBottom: '8px', fontWeight: '600' }}>
                Access Your Bookings
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
                Verify your identity to see active time slots, reschedule or cancel, and get receipt confirmations.
              </p>

              {/* 1-Click Google Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="btn btn-outline"
                style={{
                  width: '100%',
                  padding: '13px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  fontSize: '14px',
                  fontWeight: '600',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: '#FFFFFF',
                  borderColor: 'var(--border)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  marginBottom: '20px',
                }}
              >
                {googleLoading ? (
                  <span>Connecting to Google...</span>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                margin: '20px 0',
                color: 'var(--text-tertiary)',
                fontSize: '12px',
              }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
                <span style={{ padding: '0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  or lookup with email
                </span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
              </div>

              {/* Email Lookup Form */}
              <form onSubmit={handleEmailLookup} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                  }}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontSize: '13px', padding: '10px 18px', whiteSpace: 'nowrap' }}
                >
                  Find Bookings
                </button>
              </form>
            </div>
          ) : (
            /* Logged in view with bookings */
            <div>
              {/* Profile Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '20px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {customer.picture && !imgError ? (
                    <img
                      src={customer.picture}
                      alt={customer.name || 'User'}
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                      style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700',
                      fontSize: '15px',
                    }}>
                      {customer.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>
                      {customer.name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {customer.email}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  className="btn btn-ghost"
                  style={{ fontSize: '12px', color: '#DC2626', gap: '6px', padding: '6px 10px' }}
                >
                  <LogOut size={14} /> Switch / Sign Out
                </button>
              </div>

              {/* Tabs */}
              <div style={{
                display: 'flex',
                gap: '8px',
                borderBottom: '1px solid var(--border)',
                marginBottom: '20px',
              }}>
                <button
                  onClick={() => setActiveTab('upcoming')}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: activeTab === 'upcoming' ? '600' : '400',
                    color: activeTab === 'upcoming' ? 'var(--accent)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'upcoming' ? '2px solid var(--accent)' : '2px solid transparent',
                    background: 'none',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Upcoming ({upcomingBookings.length})
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: activeTab === 'history' ? '600' : '400',
                    color: activeTab === 'history' ? 'var(--accent)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'history' ? '2px solid var(--accent)' : '2px solid transparent',
                    background: 'none',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Past & History ({pastBookings.length})
                </button>
              </div>

              {/* Bookings List */}
              {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Loading reservations...
                </div>
              ) : displayedBookings.length === 0 ? (
                <div style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border)',
                }}>
                  <Ticket size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
                  <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '4px' }}>
                    {activeTab === 'upcoming' ? 'No active upcoming bookings' : 'No past bookings found'}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                    {activeTab === 'upcoming'
                      ? 'When you reserve a slot, your confirmation and details will appear here.'
                      : 'Completed or cancelled bookings will be saved here for your records.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {displayedBookings.map((b) => {
                    const { dateFormatted, timeRange } = formatBookingSlotRange(b.startTime, b.endTime);
                    const start24 = new Date(b.startTime).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
                    const end24 = new Date(b.endTime).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
                    const displayTime = `${timeRange} (${start24} - ${end24})`;

                    const isConfirmed = b.status === 'CONFIRMED';
                    const isCancelled = b.status === 'CANCELLED';
                    const isPending = b.status === 'PENDING';
                    const isExpired = isPending && new Date(b.createdAt).getTime() <= Date.now() - 10 * 60 * 1000;
                    const isPassed = isConfirmed && new Date(b.endTime) < now;

                    const gcalUrl = isConfirmed ? generateGoogleCalendarUrl({
                      title: `${b.resource?.name || 'Booking'} at ${b.tenant?.name || 'Business'}`,
                      description: `Reservation Reference: ${b.id}\nCustomer: ${b.customerName}`,
                      location: b.tenant?.name || 'Local Store',
                      startIso: b.startTime,
                      endIso: b.endTime,
                    }) : null;

                    return (
                      <div
                        key={b.id}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '18px',
                          backgroundColor: '#FFFFFF',
                          transition: 'box-shadow 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <h4 style={{ fontSize: '16px', margin: 0, fontWeight: '600' }}>
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
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                              Ref: {b.id}
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                              ₹{((b.totalAmountCents || 0) / 100).toLocaleString('en-IN')}
                            </div>
                            <div style={{ fontSize: '11px', color: isConfirmed ? '#16A34A' : 'var(--text-secondary)' }}>
                              {isConfirmed ? 'Paid in full' : isPending ? (isExpired ? 'Unpaid (Expired)' : 'Payment pending') : 'Cancelled (Not charged)'}
                            </div>
                          </div>
                        </div>

                        {/* Slot info */}
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '16px',
                          padding: '10px 14px',
                          backgroundColor: 'var(--bg-secondary)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '13px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar size={15} color="var(--accent)" />
                            <span>{dateFormatted}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={15} color="var(--accent)" />
                            <span>{displayTime}</span>
                          </div>
                        </div>

                        {/* Actions bar for active bookings */}
                        {isConfirmed && !isPassed && (
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            paddingTop: '8px',
                            borderTop: '1px solid var(--border)',
                          }}>
                            {gcalUrl && (
                              <a
                                href={gcalUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '12px',
                                  color: 'var(--accent)',
                                  textDecoration: 'none',
                                  fontWeight: '500',
                                }}
                              >
                                <ExternalLink size={13} /> Add to Google Calendar
                              </a>
                            )}

                            <button
                              onClick={() => handleCancelBooking(b.id)}
                              disabled={cancellingId === b.id}
                              className="btn btn-outline"
                              style={{
                                fontSize: '12px',
                                padding: '6px 12px',
                                color: '#DC2626',
                                borderColor: '#FCA5A5',
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
