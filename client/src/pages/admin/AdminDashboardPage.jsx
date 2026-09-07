import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import {
  IndianRupee,
  CalendarCheck,
  Building2,
  Clock,
  Plus,
  LogOut,
  X,
  ExternalLink,
  Filter,
  CheckCircle,
  AlertCircle,
  Download,
  Ban,
  Settings,
  ShieldAlert,
  Users,
  UserPlus,
  Trash2,
  ShieldCheck,
  Image as ImageIcon,
  Copy,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import LocationMapPicker from '../../components/common/LocationMapPicker';

export default function AdminDashboardPage() {
  const { tenantSlug } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('bookings'); // 'bookings' | 'resources' | 'analytics' | 'team' | 'settings'
  const [currentUser, setCurrentUser] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  const isStaff = currentUser?.role === 'STAFF';
  const effectiveSlug = currentUser?.tenant?.slug || tenantSlug;

  const handleCopyPublicLink = () => {
    const fullUrl = `${window.location.origin}/${effectiveSlug}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    toast.success('Public booking link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Filter state for bookings
  const [statusFilter, setStatusFilter] = useState('');

  // Resource creation modal state
  const [showAddResource, setShowAddResource] = useState(false);
  const [newResourceName, setNewResourceName] = useState('');
  const [newResourceDesc, setNewResourceDesc] = useState('');
  const [newResourceRate, setNewResourceRate] = useState('500');
  const [newResourceCap, setNewResourceCap] = useState('4');
  const [newResourceBuffer, setNewResourceBuffer] = useState('15');
  const [newResourceOpen, setNewResourceOpen] = useState('08:00');
  const [newResourceClose, setNewResourceClose] = useState('20:00');
  const [newResourceDuration, setNewResourceDuration] = useState('60');
  const [newResourceDays, setNewResourceDays] = useState(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
  const [creatingResource, setCreatingResource] = useState(false);

  // Slot blocking modal state
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockResourceId, setBlockResourceId] = useState('');
  const [blockDate, setBlockDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [blockStartTime, setBlockStartTime] = useState('10:00');
  const [blockEndTime, setBlockEndTime] = useState('12:00');
  const [blockReason, setBlockReason] = useState('Routine gear maintenance');
  const [blockingSlot, setBlockingSlot] = useState(false);

  // Business profile settings state
  const [businessName, setBusinessName] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessLogo, setBusinessLogo] = useState('');
  const [cancellationPolicy, setCancellationPolicy] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Team & Staff state
  const [teamMembers, setTeamMembers] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState('STAFF');
  const [inviting, setInviting] = useState(false);

  const toggleDay = (day) => {
    if (newResourceDays.includes(day)) {
      if (newResourceDays.length === 1) {
        toast.error('Resource must operate on at least one day');
        return;
      }
      setNewResourceDays(newResourceDays.filter((d) => d !== day));
    } else {
      setNewResourceDays([...newResourceDays, day]);
    }
  };

  const checkAuth = async () => {
    try {
      const res = await api.get('/admin/me');
      const user = res.data.user;
      setCurrentUser(user);
      const t = user?.tenant;
      if (t) {
        setBusinessName(t.name || '');
        setBusinessPhone(t.phone || '');
        setBusinessAddress(t.address || '');
        setBusinessLogo(t.logoUrl || '');
        setCancellationPolicy(t.cancellationPolicy || 'Free cancellation up to 24 hours prior to booking start time.');

        // Guard: If URL slug does not match the authenticated tenant, redirect immediately to their actual portal!
        if (t.slug && t.slug !== tenantSlug) {
          navigate(`/${t.slug}/admin`, { replace: true });
          return;
        }
      }
    } catch {
      localStorage.removeItem('saas_auth_token');
      navigate(`/${tenantSlug}/admin/login`);
    }
  };


  const loadTeam = async () => {
    try {
      const res = await api.get('/admin/team');
      setTeamMembers(res.data.team || []);
    } catch (err) {
      // Forbidden if staff
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const promises = [
        api.get('/admin/analytics').catch(() => ({ data: { analytics: null } })),
        api.get(`/admin/bookings${statusFilter ? `?status=${statusFilter}` : ''}`),
        api.get('/admin/resources'),
      ];

      const [analyticsRes, bookingsRes, resourcesRes] = await Promise.all(promises);

      setAnalytics(analyticsRes.data.analytics);
      setBookings(bookingsRes.data.bookings || []);
      setResources(resourcesRes.data.resources || []);
      if (resourcesRes.data.resources?.length > 0 && !blockResourceId) {
        setBlockResourceId(resourcesRes.data.resources[0].id);
      }

      if (currentUser && currentUser.role !== 'STAFF') {
        loadTeam();
      }
    } catch (err) {
      toast.error('Failed to refresh dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, [tenantSlug]);

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser, statusFilter]);

  const handleLogout = () => {
    localStorage.removeItem('saas_auth_token');
    localStorage.removeItem('saas_auth_user');
    toast.success('Logged out successfully');
    navigate(`/${effectiveSlug}/admin/login`);
  };

  const handleCancelBooking = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this booking? The slot lock will be released.')) return;

    try {
      await api.put(`/admin/bookings/${id}/cancel`);
      toast.success('Booking cancelled');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel booking');
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await api.get('/admin/bookings/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${effectiveSlug}-bookings-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Bookings CSV exported successfully');
    } catch (err) {
      toast.error('Failed to export CSV');
    }
  };


  const handleCreateResource = async (e) => {
    e.preventDefault();
    try {
      setCreatingResource(true);
      await api.post('/admin/resources', {
        name: newResourceName,
        description: newResourceDesc,
        hourlyRateCents: Math.round(parseFloat(newResourceRate) * 100),
        capacity: parseInt(newResourceCap, 10),
        bufferMinutes: parseInt(newResourceBuffer, 10),
        openTime: newResourceOpen,
        closeTime: newResourceClose,
        slotDurationMinutes: parseInt(newResourceDuration, 10),
        operatingDays: newResourceDays.join(','),
      });

      toast.success(`Resource "${newResourceName}" created!`);
      setShowAddResource(false);
      setNewResourceName('');
      setNewResourceDesc('');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create resource');
    } finally {
      setCreatingResource(false);
    }
  };

  const handleBlockSlot = async (e) => {
    e.preventDefault();
    if (!blockResourceId) {
      toast.error('Please select a resource to block');
      return;
    }

    try {
      setBlockingSlot(true);
      await api.post('/admin/slots/block', {
        resourceId: blockResourceId,
        date: blockDate,
        startTime: blockStartTime,
        endTime: blockEndTime,
        reason: blockReason,
      });

      toast.success('Time slot blocked successfully from customer bookings.');
      setShowBlockModal(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to block slot');
    } finally {
      setBlockingSlot(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      await api.put('/admin/profile', {
        name: businessName,
        phone: businessPhone,
        address: businessAddress,
        logoUrl: businessLogo,
        cancellationPolicy,
      });

      toast.success('Business settings and policies updated!');
      checkAuth();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update business settings');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleInviteMember = async (e) => {
    e.preventDefault();
    try {
      setInviting(true);
      await api.post('/admin/team', {
        name: inviteName,
        email: inviteEmail,
        password: invitePassword,
        role: inviteRole,
      });

      toast.success(`Team member ${inviteEmail} added successfully!`);
      setShowInviteModal(false);
      setInviteName('');
      setInviteEmail('');
      setInvitePassword('');
      setInviteRole('STAFF');
      loadTeam();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add team member');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (id, email) => {
    if (!window.confirm(`Are you sure you want to remove ${email} from your team?`)) return;

    try {
      await api.delete(`/admin/team/${id}`);
      toast.success('Team member removed');
      loadTeam();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove team member');
    }
  };

  const handleToggleResource = async (res) => {
    try {
      await api.put(`/admin/resources/${res.id}`, {
        isActive: !res.isActive,
      });
      toast.success(`Resource status updated`);
      loadData();
    } catch (err) {
      toast.error('Failed to update resource status');
    }
  };

  // Prepare chart data
  const chartData = [
    { name: 'Confirmed', count: analytics?.confirmedBookings || 0, fill: 'var(--success)' },
    { name: 'Pending', count: analytics?.pendingBookings || 0, fill: 'var(--warning)' },
    { name: 'Cancelled', count: analytics?.cancelledBookings || 0, fill: 'var(--error)' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Admin Top Header */}
      <header style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '70px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              backgroundColor: 'var(--accent)',
              color: '#FFFFFF',
              width: '36px',
              height: '36px',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-serif)',
              fontSize: '18px',
              fontWeight: '600',
            }}>
              {currentUser?.tenant?.name?.charAt(0) || 'B'}
            </div>
            <div>
              <h3 style={{ fontSize: '18px' }}>{currentUser?.tenant?.name || 'Business'} Portal</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Logged in as <strong>{currentUser?.email}</strong> ({currentUser?.role})
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleCopyPublicLink}
              className="btn btn-outline"
              style={{
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: copiedLink ? '#ECFDF5' : '#FFFFFF',
                borderColor: copiedLink ? '#10B981' : 'var(--border)',
                color: copiedLink ? '#047857' : 'inherit',
              }}
            >
              {copiedLink ? <Check size={14} color="#047857" /> : <Copy size={14} />}
              {copiedLink ? 'Link Copied!' : 'Copy Public Link'}
            </button>
            <Link to={`/${effectiveSlug}`} target="_blank" className="btn btn-outline" style={{ fontSize: '13px' }}>
              <ExternalLink size={14} /> View Public Page
            </Link>
            <button onClick={handleLogout} className="btn btn-ghost" style={{ fontSize: '13px' }}>
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container" style={{ padding: '36px 24px', flex: '1' }}>
        {/* Metric Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}>
          {!isStaff ? (
            <div className="metric-card">
              <div className="metric-label">TOTAL CONFIRMED REVENUE</div>
              <div className="metric-value">
                ₹{((analytics?.totalRevenueCents || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Currency: {analytics?.currency || 'INR'}
              </span>
            </div>
          ) : (
            <div className="metric-card" style={{ borderColor: 'var(--accent)' }}>
              <div className="metric-label" style={{ color: 'var(--accent)' }}>STAFF ACCESS LEVEL</div>
              <div className="metric-value" style={{ fontSize: '20px' }}>Front-Desk Mode</div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Check-ins & Daily Schedule View Only
              </span>
            </div>
          )}

          <div className="metric-card">
            <div className="metric-label">TOTAL RESERVATIONS</div>
            <div className="metric-value">{analytics?.totalBookings || 0}</div>
            <span style={{ fontSize: '11px', color: 'var(--success)' }}>
              {analytics?.confirmedBookings || 0} confirmed
            </span>
          </div>

          <div className="metric-card">
            <div className="metric-label">ACTIVE BOOKABLE RESOURCES</div>
            <div className="metric-value">{resources.filter(r => r.isActive).length}</div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              out of {resources.length} total
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border)',
          marginBottom: '24px',
        }}>
          <button
            onClick={() => setActiveTab('bookings')}
            style={{
              padding: '12px 20px',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: '500',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'bookings' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'bookings' ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Reservations & Bookings
          </button>
          <button
            onClick={() => setActiveTab('resources')}
            style={{
              padding: '12px 20px',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: '500',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'resources' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'resources' ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Resources & Inventory ({resources.length})
          </button>
          {!isStaff && (
            <button
              onClick={() => setActiveTab('analytics')}
              style={{
                padding: '12px 20px',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: '500',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'analytics' ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === 'analytics' ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Analytics & Occupancy
            </button>
          )}
          {!isStaff && (
            <button
              onClick={() => setActiveTab('team')}
              style={{
                padding: '12px 20px',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: '500',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'team' ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === 'team' ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Team & Staff ({teamMembers.length})
            </button>
          )}
          {!isStaff && (
            <button
              onClick={() => setActiveTab('settings')}
              style={{
                padding: '12px 20px',
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: '500',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'settings' ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === 'settings' ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Business Settings & Policies
            </button>
          )}
        </div>

        {/* TAB 1: BOOKINGS TABLE */}
        {activeTab === 'bookings' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Filter size={14} /> Filter Status:
                </span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input-field"
                  style={{ width: '160px', padding: '6px 10px', fontSize: '13px' }}
                >
                  <option value="">All Statuses</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="PENDING">Pending</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setShowBlockModal(true)}
                  className="btn btn-outline"
                  style={{ fontSize: '13px', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                >
                  <Ban size={14} /> Block Slot (Maintenance)
                </button>
                <button
                  onClick={handleExportCSV}
                  className="btn btn-outline"
                  style={{ fontSize: '13px' }}
                >
                  <Download size={14} /> Export CSV
                </button>
                <button onClick={loadData} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                  ↻ Refresh
                </button>
              </div>
            </div>

            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Resource / Item</th>
                    <th>Date & Time</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        No bookings found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    bookings.map((b) => {
                      const isBlocked = b.customerName?.startsWith('[BLOCKED]');
                      return (
                        <tr key={b.id}>
                          <td>
                            <div style={{ fontWeight: '500' }}>
                              {isBlocked ? (
                                <span style={{ color: 'var(--error)', fontWeight: '600' }}>
                                  🛡️ {b.customerName.replace('[BLOCKED]', '').trim()}
                                </span>
                              ) : (
                                b.customerName
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{b.customerEmail}</div>
                          </td>
                          <td>{b.resource?.name || 'Resource'}</td>
                          <td className="mono" style={{ fontSize: '13px' }}>
                            {new Date(b.startTime).toLocaleDateString()} &bull;{' '}
                            {new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            {isBlocked ? (
                              <span className="badge badge-cancelled">BLOCKED HOLD</span>
                            ) : (
                              <span className={`badge badge-${b.status.toLowerCase()}`}>
                                {b.status}
                              </span>
                            )}
                          </td>
                          <td className="mono" style={{ fontWeight: '700' }}>
                            ₹{(b.totalAmountCents / 100).toFixed(2)}
                          </td>
                          <td>
                            {b.status !== 'CANCELLED' && (
                              <button
                                onClick={() => handleCancelBooking(b.id)}
                                className="btn btn-ghost"
                                style={{ color: 'var(--error)', fontSize: '12px', padding: '4px 8px' }}
                              >
                                {isBlocked ? 'Unblock' : 'Cancel'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: RESOURCES & INVENTORY */}
        {activeTab === 'resources' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '20px' }}>Managed Resources & Inventory</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Add or edit bookable resources, rental equipment, or spaces with custom schedules.
                </p>
              </div>

              <button
                onClick={() => setShowAddResource(true)}
                className="btn btn-primary"
              >
                <Plus size={16} /> Add New Resource
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '20px',
            }}>
              {resources.map((r) => (
                <div key={r.id} style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <h4 style={{ fontSize: '18px' }}>{r.name}</h4>
                      <span className={`badge ${r.isActive ? 'badge-available' : 'badge-booked'}`}>
                        {r.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                      {r.description || 'No description provided.'}
                    </p>

                    <div className="mono" style={{ fontSize: '16px', fontWeight: '700', color: 'var(--accent)', marginBottom: '8px' }}>
                      ₹{(r.hourlyRateCents / 100).toFixed(2)}/hr
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Operating Hours: <strong className="mono">{r.openTime || '08:00'} – {r.closeTime || '20:00'}</strong> ({r.slotDurationMinutes || 60}m slots)
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                      Capacity: {r.capacity} &bull; Prep Buffer: {r.bufferMinutes}m
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleResource(r)}
                    className="btn btn-outline"
                    style={{ width: '100%', fontSize: '13px' }}
                  >
                    {r.isActive ? 'Deactivate Resource' : 'Activate Resource'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            padding: '32px',
          }}>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Reservation Distribution</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '32px' }}>
              Real-time booking volume across confirmed, pending, and cancelled states.
            </p>

            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* TAB 4: TEAM & STAFF (RBAC) */}
        {!isStaff && activeTab === 'team' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '20px', marginBottom: '4px' }}>Team Members & Permissions</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Manage your front-desk staff and admin accounts. Front-desk staff have access to reservations and check-ins, while financial revenue metrics are protected.
                </p>
              </div>
              <button
                onClick={() => setShowInviteModal(true)}
                className="btn btn-primary"
                style={{ fontSize: '13px' }}
              >
                <UserPlus size={16} /> Add Team Member
              </button>
            </div>

            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)',
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-alt)', borderBottom: '1px solid var(--border)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 16px' }}>Member Name</th>
                    <th style={{ padding: '12px 16px' }}>Email Address</th>
                    <th style={{ padding: '12px 16px' }}>Access Role</th>
                    <th style={{ padding: '12px 16px' }}>Added Date</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map((member) => {
                    const isSelf = member.id === currentUser?.id;
                    return (
                      <tr key={member.id} style={{ borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                        <td style={{ padding: '14px 16px', fontWeight: '500' }}>
                          {member.name || 'Team Member'} {isSelf && <span style={{ fontSize: '11px', color: 'var(--accent)' }}>(You)</span>}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }} className="mono">
                          {member.email}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span className={`badge ${member.role === 'ADMIN' ? 'badge-available' : 'badge-booked'}`}>
                            {member.role === 'ADMIN' ? 'Administrator' : 'Front-Desk Staff'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                          {new Date(member.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          {!isSelf && (
                            <button
                              onClick={() => handleRemoveMember(member.id, member.email)}
                              className="btn btn-outline"
                              style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                              title="Remove Team Member"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: BUSINESS SETTINGS */}
        {!isStaff && activeTab === 'settings' && (
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            padding: '32px',
            maxWidth: '680px',
          }}>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Business Profile & Branding</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Configure your brand logo, address, contact details, and custom cancellation terms shown to customers.
            </p>

            <form onSubmit={handleSaveProfile}>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Business Name</label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Business Brand Logo URL</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input
                    type="url"
                    placeholder="https://... image URL for your business logo"
                    value={businessLogo}
                    onChange={(e) => setBusinessLogo(e.target.value)}
                    className="input-field"
                    style={{ flex: 1 }}
                  />
                  {businessLogo && (
                    <img
                      src={businessLogo}
                      alt="Logo preview"
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '4px',
                        objectFit: 'cover',
                        border: '1px solid var(--border)',
                      }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                  Rendered in your portal header and customer calendar invites.
                </span>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Contact Phone Number</label>
                <input
                  type="tel"
                  placeholder="+1 (555) 234-5678"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  className="input-field"
                />
              </div>

              <LocationMapPicker
                value={businessAddress}
                onChange={setBusinessAddress}
                label="Physical Location / Address (Search or Pin on Map)"
                placeholder="Search landmark, street, city or drag pin on map..."
              />

              <div style={{ marginBottom: '24px' }}>
                <label className="input-label">Customer Cancellation Policy</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Full refund if cancelled at least 24 hours in advance."
                  value={cancellationPolicy}
                  onChange={(e) => setCancellationPolicy(e.target.value)}
                  className="input-field"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingProfile}
              >
                {savingProfile ? 'Saving Changes...' : 'Save Settings'}
              </button>
            </form>
          </div>
        )}
      </main>

      {/* MODAL: ADD RESOURCE */}
      {showAddResource && (
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
            borderRadius: 'var(--radius-sm)',
            width: '100%',
            maxWidth: '540px',
            padding: '32px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
            position: 'relative',
          }}>
            <button
              onClick={() => setShowAddResource(false)}
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '20px', marginBottom: '4px' }}>Add New Resource</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Add a bookable space, rental item, or equipment with custom operating hours.
            </p>

            <form onSubmit={handleCreateResource}>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Resource Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mountain E-Bike #4, Court 1, Studio A..."
                  value={newResourceName}
                  onChange={(e) => setNewResourceName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Description</label>
                <textarea
                  placeholder="Details, included gear, specifications..."
                  value={newResourceDesc}
                  onChange={(e) => setNewResourceDesc(e.target.value)}
                  className="input-field"
                  rows={2}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="input-label">Rate (₹ / hr) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newResourceRate}
                    onChange={(e) => setNewResourceRate(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="input-label">Max Capacity *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newResourceCap}
                    onChange={(e) => setNewResourceCap(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              {/* Operating Schedule */}
              <div style={{
                backgroundColor: 'var(--bg-alt)',
                border: '1px solid var(--border)',
                padding: '16px',
                borderRadius: 'var(--radius-xs)',
                marginBottom: '24px',
              }}>
                <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: '12px' }}>
                  Operating Schedule & Duration
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label className="input-label" style={{ fontSize: '11px' }}>Open Time</label>
                    <input
                      type="time"
                      value={newResourceOpen}
                      onChange={(e) => setNewResourceOpen(e.target.value)}
                      className="input-field mono"
                    />
                  </div>
                  <div>
                    <label className="input-label" style={{ fontSize: '11px' }}>Close Time</label>
                    <input
                      type="time"
                      value={newResourceClose}
                      onChange={(e) => setNewResourceClose(e.target.value)}
                      className="input-field mono"
                    />
                  </div>
                  <div>
                    <label className="input-label" style={{ fontSize: '11px' }}>Slot Duration</label>
                    <select
                      value={newResourceDuration}
                      onChange={(e) => setNewResourceDuration(e.target.value)}
                      className="input-field"
                    >
                      <option value="30">30 Mins</option>
                      <option value="60">1 Hour</option>
                      <option value="90">1.5 Hours</option>
                      <option value="120">2 Hours</option>
                      <option value="240">4 Hours</option>
                    </select>
                  </div>
                </div>

                {/* Operating Days of Week */}
                <div style={{ marginTop: '14px' }}>
                  <label className="input-label" style={{ fontSize: '11px', marginBottom: '6px' }}>Active Operating Days</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { code: 'MON', label: 'Mon' },
                      { code: 'TUE', label: 'Tue' },
                      { code: 'WED', label: 'Wed' },
                      { code: 'THU', label: 'Thu' },
                      { code: 'FRI', label: 'Fri' },
                      { code: 'SAT', label: 'Sat' },
                      { code: 'SUN', label: 'Sun' },
                    ].map(({ code, label }) => {
                      const active = newResourceDays.includes(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => toggleDay(code)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: '600',
                            borderRadius: '3px',
                            border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                            backgroundColor: active ? 'var(--accent)' : '#FFFFFF',
                            color: active ? '#FFFFFF' : 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddResource(false)}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={creatingResource}
                >
                  {creatingResource ? 'Saving...' : 'Create Resource'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BLOCK A SLOT (MAINTENANCE / PRIVATE HOLD) */}
      {showBlockModal && (
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
            borderRadius: 'var(--radius-sm)',
            width: '100%',
            maxWidth: '480px',
            padding: '32px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
            position: 'relative',
          }}>
            <button
              onClick={() => setShowBlockModal(false)}
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', marginBottom: '8px' }}>
              <Ban size={20} />
              <h3 style={{ fontSize: '20px' }}>Block a Time Slot</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Prevent customers from reserving this window for repairs, maintenance, or private use.
            </p>

            <form onSubmit={handleBlockSlot}>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Select Resource *</label>
                <select
                  value={blockResourceId}
                  onChange={(e) => setBlockResourceId(e.target.value)}
                  className="input-field"
                  required
                >
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Date *</label>
                <input
                  type="date"
                  required
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="input-field mono"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="input-label">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={blockStartTime}
                    onChange={(e) => setBlockStartTime(e.target.value)}
                    className="input-field mono"
                  />
                </div>
                <div>
                  <label className="input-label">End Time *</label>
                  <input
                    type="time"
                    required
                    value={blockEndTime}
                    onChange={(e) => setBlockEndTime(e.target.value)}
                    className="input-field mono"
                  />
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label className="input-label">Internal Reason / Label *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gear maintenance, Private event..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={blockingSlot}
                >
                  {blockingSlot ? 'Blocking Slot...' : 'Confirm Block'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INVITE TEAM MEMBER */}
      {showInviteModal && (
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
            borderRadius: 'var(--radius-sm)',
            width: '100%',
            maxWidth: '480px',
            padding: '32px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
            position: 'relative',
          }}>
            <button
              onClick={() => setShowInviteModal(false)}
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', marginBottom: '8px' }}>
              <UserPlus size={20} />
              <h3 style={{ fontSize: '20px' }}>Add Team Member</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Create an account for front-desk staff or an administrator.
            </p>

            <form onSubmit={handleInviteMember}>
              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Member Name</label>
                <input
                  type="text"
                  placeholder="e.g. Casey Harper"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="staff@yourbusiness.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Temporary Password *</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label className="input-label">Role & Permission Level *</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="input-field"
                >
                  <option value="STAFF">Front-Desk Staff (Calendar & Check-ins only)</option>
                  <option value="ADMIN">Administrator (Full Access to Revenue & Settings)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={inviting}
                >
                  {inviting ? 'Adding Member...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
