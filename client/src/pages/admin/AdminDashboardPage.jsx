import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import {
  RotateCw,
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
  Mail,
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
  const tenant = currentUser?.tenant;

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
  const [showWalkinModal, setShowWalkinModal] = useState(false);
  const [walkinResourceId, setWalkinResourceId] = useState('');
  const [walkinDate, setWalkinDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [walkinSlots, setWalkinSlots] = useState([]);
  const [loadingWalkinSlots, setLoadingWalkinSlots] = useState(false);
  const [walkinIsClosed, setWalkinIsClosed] = useState(false);
  const [walkinClosedMsg, setWalkinClosedMsg] = useState('');
  const [selectedWalkinSlot, setSelectedWalkinSlot] = useState(null);
  const [walkinCustomerName, setWalkinCustomerName] = useState('');
  const [walkinCustomerPhone, setWalkinCustomerPhone] = useState('');
  const [walkinCustomerEmail, setWalkinCustomerEmail] = useState('');
  const [walkinAmount, setWalkinAmount] = useState('');
  const [submittingWalkin, setSubmittingWalkin] = useState(false);

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

  const handleMarkPaid = async (id) => {
    if (!window.confirm('Confirm offline / cash payment for this booking? The slot will be permanently marked CONFIRMED and the customer will receive an email confirmation.')) return;

    try {
      await api.post(`/admin/bookings/${id}/mark-paid`);
      toast.success('Booking marked as PAID & CONFIRMED');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to mark booking as paid');
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

  

  const isSlotInPast = (dateStr, startTimeStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = startTimeStr.split(':').map(Number);
    const slotDateTime = new Date(y, m - 1, d, h, min, 0);
    return slotDateTime <= new Date();
  };

  const fetchWalkinSlots = async (resourceId, date) => {
    if (!resourceId || !date) return;
    setLoadingWalkinSlots(true);
    setSelectedWalkinSlot(null);
    try {
      const res = await api.get(`/resources/${resourceId}/slots?date=${date}`);
      setWalkinIsClosed(res.data.isClosed || false);
      setWalkinClosedMsg(res.data.message || '');
      setWalkinSlots(res.data.slots || []);
    } catch (err) {
      console.error('Failed to load slots for walkin:', err);
      setWalkinSlots([]);
      setWalkinIsClosed(false);
    } finally {
      setLoadingWalkinSlots(false);
    }
  };

  useEffect(() => {
    if (showWalkinModal && walkinResourceId && walkinDate) {
      fetchWalkinSlots(walkinResourceId, walkinDate);
    }
  }, [showWalkinModal, walkinResourceId, walkinDate]);

  const handleWalkinBooking = async (e) => {
    e.preventDefault();
    const resId = walkinResourceId || (resources.find(r => r.isActive)?.id || resources[0]?.id);
    if (!resId) {
      toast.error('Please select an active resource');
      return;
    }
    if (!selectedWalkinSlot) {
      toast.error('Please select an available upcoming time slot');
      return;
    }
    if (!walkinCustomerName.trim()) {
      toast.error('Please enter customer name');
      return;
    }

    try {
      setSubmittingWalkin(true);
      const selectedRes = resources.find(r => r.id === resId);
      const rateCents = walkinAmount !== '' ? Math.round(parseFloat(walkinAmount) * 100) : (selectedRes?.hourlyRateCents || 0);

      const res = await api.post('/admin/bookings/walk-in', {
        resourceId: resId,
        date: walkinDate,
        startTime: selectedWalkinSlot.startTime,
        endTime: selectedWalkinSlot.endTime,
        customerName: walkinCustomerName.trim(),
        customerPhone: walkinCustomerPhone.trim(),
        customerEmail: walkinCustomerEmail.trim(),
        amountPaidCents: rateCents,
      });

      toast.success(res.data?.message || 'Walk-in cash booking confirmed successfully!');
      setShowWalkinModal(false);
      setSelectedWalkinSlot(null);
      setWalkinCustomerName('');
      setWalkinCustomerPhone('');
      setWalkinCustomerEmail('');
      setWalkinAmount('');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create walk-in booking');
    } finally {
      setSubmittingWalkin(false);
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
      const res = await api.post('/admin/team', {
        name: inviteName,
        email: inviteEmail,
        role: inviteRole,
      });

      if (res.data?.inviteSent) {
        toast.success(`Invitation dispatched to ${inviteEmail}! Secure setup link emailed.`);
      } else {
        toast.success(`Team member ${inviteEmail} added successfully!`);
      }
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

  const handleResendInvite = async (id, email) => {
    try {
      const res = await api.post(`/admin/team/${id}/resend-invite`);
      toast.success(res.data?.message || `Invitation link resent to ${email}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resend invitation');
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
    <div className="admin-layout" style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg)' }}>
      {/* LEFT SIDEBAR NAVIGATION */}
      <aside
        className="admin-sidebar"
        style={{
          width: '260px',
          minWidth: '260px',
          backgroundColor: '#FAF7F2',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 50,
        }}
      >
        {/* Brand / Business Header */}
        <div
          className="admin-sidebar-brand"
          style={{
            padding: '20px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--accent)',
              color: '#FFFFFF',
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-xs, 2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-serif)',
              fontWeight: '700',
              fontSize: '18px',
              flexShrink: 0,
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}
          >
            {tenant?.name ? tenant.name.charAt(0).toUpperCase() : 'B'}
          </div>
          <div style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontWeight: '600',
                fontSize: '14px',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {tenant?.name || 'Booking Platform'}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '1px',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                /{effectiveSlug}
              </span>
              <span
                style={{
                  backgroundColor: '#EDF4ED',
                  color: '#4A6B4A',
                  fontSize: '9px',
                  fontWeight: '600',
                  padding: '1px 5px',
                  borderRadius: '2px',
                  letterSpacing: '0.04em',
                }}
              >
                LIVE
              </span>
            </div>
          </div>
        </div>

        {/* Sidebar Nav Items */}
        <div
          className="admin-sidebar-nav"
          style={{
            padding: '16px 12px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#8A8275',
              padding: '6px 12px 4px',
            }}
          >
            Operations
          </div>

          <button
            onClick={() => setActiveTab('bookings')}
            className={`admin-nav-item ${activeTab === 'bookings' ? 'active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '9px 12px',
              borderRadius: 'var(--radius-xs, 2px)',
              border: activeTab === 'bookings' ? '1px solid var(--border)' : '1px solid transparent',
              backgroundColor: activeTab === 'bookings' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'bookings' ? 'var(--text-primary)' : '#333333',
              fontFamily: 'var(--font-sans)',
              fontSize: '13.5px',
              fontWeight: activeTab === 'bookings' ? 600 : 500,
              cursor: 'pointer',
              textAlign: 'left',
              boxShadow: activeTab === 'bookings' ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CalendarCheck size={16} color={activeTab === 'bookings' ? 'var(--accent)' : '#4A4036'} />
              <span>Bookings & Schedule</span>
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: '10px',
                backgroundColor: activeTab === 'bookings' ? 'var(--accent-light)' : '#E8E1D5',
                color: activeTab === 'bookings' ? 'var(--accent)' : '#4A4036',
              }}
            >
              {bookings.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('resources')}
            className={`admin-nav-item ${activeTab === 'resources' ? 'active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '9px 12px',
              borderRadius: 'var(--radius-xs, 2px)',
              border: activeTab === 'resources' ? '1px solid var(--border)' : '1px solid transparent',
              backgroundColor: activeTab === 'resources' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'resources' ? 'var(--text-primary)' : '#333333',
              fontFamily: 'var(--font-sans)',
              fontSize: '13.5px',
              fontWeight: activeTab === 'resources' ? 600 : 500,
              cursor: 'pointer',
              textAlign: 'left',
              boxShadow: activeTab === 'resources' ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building2 size={16} color={activeTab === 'resources' ? 'var(--accent)' : '#4A4036'} />
              <span>Resources & Inventory</span>
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: '10px',
                backgroundColor: activeTab === 'resources' ? 'var(--accent-light)' : '#E8E1D5',
                color: activeTab === 'resources' ? 'var(--accent)' : '#4A4036',
              }}
            >
              {resources.length}
            </span>
          </button>

          {!isStaff && (
            <button
              onClick={() => setActiveTab('analytics')}
              className={`admin-nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-xs, 2px)',
                border: activeTab === 'analytics' ? '1px solid var(--border)' : '1px solid transparent',
                backgroundColor: activeTab === 'analytics' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'analytics' ? 'var(--text-primary)' : '#333333',
                fontFamily: 'var(--font-sans)',
                fontSize: '13.5px',
                fontWeight: activeTab === 'analytics' ? 600 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: activeTab === 'analytics' ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={16} color={activeTab === 'analytics' ? 'var(--accent)' : '#4A4036'} />
                <span>Analytics & Occupancy</span>
              </span>
            </button>
          )}

          {!isStaff && (
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#8A8275',
                padding: '14px 12px 4px',
              }}
            >
              Administration
            </div>
          )}

          {!isStaff && (
            <button
              onClick={() => setActiveTab('team')}
              className={`admin-nav-item ${activeTab === 'team' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-xs, 2px)',
                border: activeTab === 'team' ? '1px solid var(--border)' : '1px solid transparent',
                backgroundColor: activeTab === 'team' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'team' ? 'var(--text-primary)' : '#333333',
                fontFamily: 'var(--font-sans)',
                fontSize: '13.5px',
                fontWeight: activeTab === 'team' ? 600 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: activeTab === 'team' ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={16} color={activeTab === 'team' ? 'var(--accent)' : '#4A4036'} />
                <span>Team & Staff</span>
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: '10px',
                  backgroundColor: activeTab === 'team' ? 'var(--accent-light)' : '#E8E1D5',
                  color: activeTab === 'team' ? 'var(--accent)' : '#4A4036',
                }}
              >
                {teamMembers.length}
              </span>
            </button>
          )}

          {!isStaff && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`admin-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-xs, 2px)',
                border: activeTab === 'settings' ? '1px solid var(--border)' : '1px solid transparent',
                backgroundColor: activeTab === 'settings' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'settings' ? 'var(--text-primary)' : '#333333',
                fontFamily: 'var(--font-sans)',
                fontSize: '13.5px',
                fontWeight: activeTab === 'settings' ? 600 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: activeTab === 'settings' ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Settings size={16} color={activeTab === 'settings' ? 'var(--accent)' : '#4A4036'} />
                <span>Business Settings</span>
              </span>
            </button>
          )}
        </div>

        {/* Sidebar Footer */}
        <div
          className="admin-sidebar-footer"
          style={{
            padding: '16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            backgroundColor: '#F5EFE6',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-xs, 2px)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {currentUser?.email}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Role: <strong style={{ color: 'var(--accent)' }}>{currentUser?.role}</strong>
            </div>
          </div>

          <button
            onClick={handleCopyPublicLink}
            className="btn btn-outline"
            style={{
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px 10px',
              backgroundColor: copiedLink ? '#EDF4ED' : '#FFFFFF',
              borderColor: copiedLink ? '#4A6B4A' : 'var(--border)',
              color: copiedLink ? '#4A6B4A' : 'var(--text-primary)',
            }}
          >
            {copiedLink ? <Check size={13} color="#4A6B4A" /> : <Copy size={13} />}
            {copiedLink ? 'Link Copied!' : 'Copy Public Link'}
          </button>

          <Link
            to={`/${effectiveSlug}`}
            target="_blank"
            className="btn btn-outline"
            style={{
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px 10px',
              backgroundColor: '#FFFFFF',
              borderColor: 'var(--border)',
              textDecoration: 'none',
              color: 'var(--text-primary)',
            }}
          >
            <ExternalLink size={13} /> View Live Portal
          </Link>

          <button
            onClick={handleLogout}
            className="btn btn-ghost"
            style={{
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 10px',
              color: '#A33B2E',
              cursor: 'pointer',
            }}
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="admin-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* TOPBAR */}
        <header
          className="admin-topbar"
          style={{
            height: '64px',
            borderBottom: '1px solid var(--border)',
            backgroundColor: '#FAF7F2',
            padding: '0 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 40,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '17px',
                fontFamily: 'var(--font-serif)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              {activeTab === 'bookings' && 'Reservations & Bookings'}
              {activeTab === 'resources' && 'Resources & Inventory'}
              {activeTab === 'analytics' && 'Analytics & Occupancy'}
              {activeTab === 'team' && 'Team & Staff Management'}
              {activeTab === 'settings' && 'Business Settings & Policies'}
            </h1>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Real-time operational dashboard for {tenant?.name || 'your business'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: '500',
                color: '#16A34A',
                padding: '4px 10px',
                backgroundColor: 'rgba(22, 163, 74, 0.08)',
                borderRadius: '12px',
                border: '1px solid rgba(22, 163, 74, 0.2)',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#16A34A', display: 'inline-block' }}></span>
              Live Sync
            </span>
          </div>
        </header>

        {/* CONTAINER FOR METRICS AND TAB CONTENT */}
        <div style={{ padding: '28px 32px', flex: 1 }}>
          {/* Cross-Tenant Boundary Notice */}
          {currentUser?.tenant?.slug && tenantSlug && currentUser.tenant.slug !== tenantSlug && (
            <div
              style={{
                marginBottom: '24px',
                padding: '14px 18px',
                backgroundColor: '#FEF3C7',
                border: '1px solid #FCD34D',
                borderRadius: 'var(--radius-xs, 2px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={18} color="#D97706" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '13px', color: '#78350F', lineHeight: '1.4' }}>
                  <strong style={{ color: '#92400E' }}>Cross-Tenant Portal Notice:</strong> You are signed in as an administrator for <strong>{currentUser?.tenant?.name}</strong> (<code>/{currentUser?.tenant?.slug}</code>). You are currently viewing the workspace for <strong>{tenantSlug}</strong>.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => navigate(`/${currentUser.tenant.slug}/admin`)}
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '6px 14px', whiteSpace: 'nowrap' }}
                >
                  Switch to My Business
                </button>
                <button
                  onClick={handleLogout}
                  className="btn btn-outline"
                  style={{ fontSize: '12px', padding: '6px 14px', whiteSpace: 'nowrap' }}
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
          {/* METRIC CARDS (Requirements 2, 3, 7) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '28px',
            }}
          >
            {!isStaff ? (
              <div className="metric-card">
                <div className="metric-label">TOTAL CONFIRMED REVENUE</div>
                <div className="metric-value">
                  <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, marginRight: '2px' }}>{"\u20B9"}</span>
                  {((analytics?.totalRevenueCents || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span style={{ fontSize: '12px', color: '#10B981', fontWeight: '500' }}>
                  +100% vs last week &bull; {analytics?.currency || 'INR'}
                </span>
              </div>
            ) : (
              <div className="metric-card" style={{ borderColor: 'var(--accent)' }}>
                <div className="metric-label" style={{ color: 'var(--accent)' }}>STAFF ACCESS LEVEL</div>
                <div className="metric-value" style={{ fontSize: '24px' }}>Front-Desk Mode</div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Check-ins & Daily Schedule View Only
                </span>
              </div>
            )}

            <div className="metric-card">
              <div className="metric-label">TOTAL RESERVATIONS</div>
              <div className="metric-value">{analytics?.totalBookings || 0}</div>
              <span style={{ fontSize: '12px', color: '#10B981', fontWeight: '500' }}>
                {analytics?.confirmedBookings || 0} confirmed &bull; {bookings.filter(b => b.status === 'CANCELLED').length} cancelled
              </span>
            </div>

            <div className="metric-card">
              <div className="metric-label">ACTIVE BOOKABLE RESOURCES</div>
              <div className="metric-value">{resources.filter(r => r.isActive).length}</div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {resources.filter(r => r.isActive).length} active of {resources.length} total inventory
              </span>
            </div>
          </div>

          {/* TAB CONTENT */}
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
                  style={{
                    width: '160px',
                    padding: '7px 32px 7px 12px',
                    fontSize: '13px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-xs, 2px)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23737373\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 10px center'
                  }}
                >
                  <option value="">All Statuses</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="PENDING">Pending</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    const firstActive = resources.find(r => r.isActive)?.id || resources[0]?.id || '';
                    setWalkinResourceId(firstActive);
                    setShowWalkinModal(true);
                  }}
                  className="btn btn-primary"
                  style={{
                    fontSize: '13px',
                    backgroundColor: '#059669',
                    color: '#FFFFFF',
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Plus size={14} /> Walk-in Booking (Cash)
                </button>
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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><RotateCw size={13} /> Refresh</span>
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
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {isBlocked ? (
                                <span style={{ color: 'var(--error)', fontWeight: 600 }}>
                                    {b.customerName.replace('[BLOCKED]', '').trim()}
                                </span>
                              ) : (
                                b.customerName
                              )}
                            </div>
                            {b.user || b.razorpayPaymentId?.startsWith('cash_counter_') || b.customerEmail?.includes('@counter.internal') ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '1px 7px',
                                  borderRadius: '3px',
                                  backgroundColor: 'rgba(5, 150, 105, 0.1)',
                                  color: '#059669',
                                }}>
                                  Walk-in &bull; Logged by {b.user?.name || b.user?.email || 'Staff'}
                                </span>
                                {b.customerEmail && !b.customerEmail.includes('@counter.internal') && b.customerEmail !== b.user?.email && (
                                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    {b.customerEmail}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                {b.customerEmail}
                              </div>
                            )}
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
                          <td style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, marginRight: '1px' }}>{"\u20B9"}</span>
                            {(b.totalAmountCents / 100).toFixed(2)}
                          </td>
                          <td>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              {b.status === 'PENDING' && !isBlocked && (
                                <button
                                  onClick={() => handleMarkPaid(b.id)}
                                  style={{
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    padding: '5px 12px',
                                    borderRadius: 'var(--radius-xs, 2px)',
                                    border: '1px solid rgba(16, 185, 129, 0.35)',
                                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                                    color: '#059669',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#059669';
                                    e.currentTarget.style.color = '#FFFFFF';
                                    e.currentTarget.style.backgroundColor = '#059669';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.35)';
                                    e.currentTarget.style.color = '#059669';
                                    e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
                                  }}
                                >
                                  <CheckCircle size={12} />
                                  Mark Paid (Cash)
                                </button>
                              )}
                              {b.status !== 'CANCELLED' && (
                              <button
                                onClick={() => handleCancelBooking(b.id)}
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  padding: '5px 12px',
                                  borderRadius: 'var(--radius-xs, 2px)',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                  backgroundColor: 'rgba(239, 68, 68, 0.04)',
                                  color: '#EF4444',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = '#EF4444';
                                  e.currentTarget.style.color = '#FFFFFF';
                                  e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                                  e.currentTarget.style.color = '#EF4444';
                                  e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.04)';
                                }}
                              >
                                {isBlocked ? 'Unblock' : 'Cancel Booking'}
                              </button>
                            )}
                            </div>
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

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => setShowAddResource(true)}
                  className="btn btn-primary"
                  style={{ fontSize: '13px' }}
                >
                  <Plus size={15} /> Add New Resource
                </button>
                <button onClick={loadData} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><RotateCw size={13} /> Refresh</span>
                </button>
              </div>
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

                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: '600', color: 'var(--accent)', marginBottom: '8px' }}>
                      <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, marginRight: '1px' }}>{"\u20B9"}</span>
                      {(r.hourlyRateCents / 100).toFixed(2)}<span style={{ fontSize: '13px', fontWeight: '400', fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)' }}>/hr</span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Operating Hours: <strong className="mono">{r.openTime || '08:00'} - {r.closeTime || '20:00'}</strong> ({r.slotDurationMinutes || 60}m slots)
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
                  <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
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
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="btn btn-primary"
                  style={{ fontSize: '13px' }}
                >
                  <UserPlus size={15} /> Add Staff
                </button>
                <button onClick={loadData} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}><RotateCw size={13} /> Refresh</span>
                </button>
              </div>
            </div>

            <div className="admin-table-wrapper">
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
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => handleResendInvite(member.id, member.email)}
                                className="btn btn-outline"
                                style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                title="Resend 24h Setup Link"
                              >
                                <Mail size={13} /> Resend Invite
                              </button>
                              <button
                                onClick={() => handleRemoveMember(member.id, member.email)}
                                className="btn btn-outline"
                                style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                title="Remove Team Member"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
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
      
        </div>
      </main>

      {/* MODALS */}


      {/* MODAL: ADD RESOURCE */}
      {showAddResource && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(23, 23, 23, 0.4)', backdropFilter: 'blur(3px)',
          backdropFilter: 'blur(12px)',
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
                  <label className="input-label">Rate ({"\u20B9"} / hr) *</label>
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
          backgroundColor: 'rgba(23, 23, 23, 0.4)', backdropFilter: 'blur(3px)',
          backdropFilter: 'blur(12px)',
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

      
      {/* MODAL: WALK-IN / CASH BOOKING */}
      {showWalkinModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(23, 23, 23, 0.4)',
          backdropFilter: 'blur(12px)',
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
            maxWidth: '560px',
            padding: '28px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
            position: 'relative',
            maxHeight: '92vh',
            overflowY: 'auto',
          }}>
            <button
              onClick={() => setShowWalkinModal(false)}
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', marginBottom: '6px' }}>
              <CheckCircle size={22} />
              <h3 style={{ fontSize: '20px', fontFamily: 'var(--font-serif)', margin: 0 }}>Walk-in Cash Booking</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
              Select a live upcoming available slot, enter customer details, and collect cash. Logged under <strong>{currentUser?.name || currentUser?.email}</strong>.
            </p>

            <form onSubmit={handleWalkinBooking}>
              {/* Resource Selection */}
              <div style={{ marginBottom: '14px' }}>
                <label className="input-label">Select Resource *</label>
                <select
                  value={walkinResourceId}
                  onChange={(e) => {
                    setWalkinResourceId(e.target.value);
                    const selected = resources.find(r => r.id === e.target.value);
                    if (selected) {
                      setWalkinAmount((selected.hourlyRateCents / 100).toFixed(2));
                    }
                  }}
                  className="input-field"
                  required
                >
                  {resources.filter(r => r.isActive).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} &mdash; {"\u20B9"}{(r.hourlyRateCents / 100).toFixed(2)} / slot
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Quick Tabs */}
              <div style={{ marginBottom: '14px' }}>
                <label className="input-label">Booking Date *</label>
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {Array.from({ length: 5 }, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() + i);
                    const ds = d.toISOString().split('T')[0];
                    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    const isSel = walkinDate === ds;
                    return (
                      <button
                        key={ds}
                        type="button"
                        onClick={() => setWalkinDate(ds)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 500,
                          border: isSel ? '1px solid #059669' : '1px solid var(--border)',
                          backgroundColor: isSel ? 'rgba(5, 150, 105, 0.1)' : 'var(--bg)',
                          color: isSel ? '#059669' : 'var(--text-primary)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Slot Availability Grid */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="input-label" style={{ margin: 0 }}>Available Slots *</label>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {walkinSlots.filter(s => s.status === 'available' && !isSlotInPast(walkinDate, s.startTime)).length} available
                  </span>
                </div>

                {walkinIsClosed ? (
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-alt)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Resource is closed on this date ({walkinClosedMsg})
                  </div>
                ) : loadingWalkinSlots ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Checking real-time slot availability...
                  </div>
                ) : walkinSlots.length === 0 ? (
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-alt)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    No slots available for this date.
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '8px',
                    maxHeight: '170px',
                    overflowY: 'auto',
                    padding: '6px',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg)',
                  }}>
                    {walkinSlots.map((slot) => {
                      const isPast = isSlotInPast(walkinDate, slot.startTime);
                      const isAvailable = slot.status === 'available' && !isPast;
                      const isSelected = selectedWalkinSlot?.startTime === slot.startTime;

                      let statusBadge = 'Available';
                      if (isPast) statusBadge = 'Past';
                      else if (slot.status === 'booked') statusBadge = 'Booked';
                      else if (slot.status === 'blocked') statusBadge = 'Blocked';
                      else if (slot.status === 'locked') statusBadge = 'Held';

                      return (
                        <button
                          key={slot.startTime}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => setSelectedWalkinSlot(slot)}
                          style={{
                            padding: '8px 6px',
                            borderRadius: '4px',
                            border: isSelected
                              ? '2px solid #059669'
                              : isAvailable
                              ? '1px solid rgba(5, 150, 105, 0.4)'
                              : '1px solid var(--border)',
                            backgroundColor: isSelected
                              ? '#059669'
                              : isAvailable
                              ? '#FFFFFF'
                              : 'rgba(0,0,0,0.04)',
                            color: isSelected
                              ? '#FFFFFF'
                              : isAvailable
                              ? 'var(--text-primary)'
                              : 'var(--text-muted)',
                            cursor: isAvailable ? 'pointer' : 'not-allowed',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            opacity: isAvailable ? 1 : 0.55,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>
                            {slot.startTime} &ndash; {slot.endTime}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            fontWeight: 600,
                            color: isSelected ? '#FFFFFF' : isAvailable ? '#059669' : 'var(--text-muted)',
                          }}>
                            {isSelected ? 'SELECTED' : statusBadge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Customer Inputs */}
              <div style={{ marginBottom: '14px' }}>
                <label className="input-label">Customer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={walkinCustomerName}
                  onChange={(e) => setWalkinCustomerName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="input-label">Customer Phone (Optional)</label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={walkinCustomerPhone}
                    onChange={(e) => setWalkinCustomerPhone(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="input-label">Customer Email (Optional)</label>
                  <input
                    type="email"
                    placeholder="For instant email receipt"
                    value={walkinCustomerEmail}
                    onChange={(e) => setWalkinCustomerEmail(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              {/* Cash Collection & Staff Attribution */}
              <div style={{
                backgroundColor: 'rgba(5, 150, 105, 0.05)',
                border: '1px solid rgba(5, 150, 105, 0.2)',
                borderRadius: '6px',
                padding: '12px 16px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Staff Audit Attribution
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Logged by {currentUser?.name || currentUser?.email} ({currentUser?.role})
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Cash to Collect
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#059669', fontFamily: 'var(--font-serif)' }}>
                    {"\u20B9"}{walkinAmount || '0.00'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowWalkinModal(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ backgroundColor: '#059669', borderColor: '#059669' }}
                  disabled={submittingWalkin || !selectedWalkinSlot}
                >
                  {submittingWalkin ? 'Confirming...' : 'Confirm & Collect Cash'}
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
          backgroundColor: 'rgba(23, 23, 23, 0.4)', backdropFilter: 'blur(3px)',
          backdropFilter: 'blur(12px)',
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
              <h3 style={{ fontSize: '20px' }}>Add Staff</h3>
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

              <div style={{
                padding: '12px 14px',
                backgroundColor: 'rgba(37, 99, 235, 0.05)',
                border: '1px solid rgba(37, 99, 235, 0.18)',
                borderRadius: 'var(--radius-xs)',
                marginBottom: '16px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start'
              }}>
                <Mail size={16} color="var(--accent)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>Email Activation Link</strong>
                  A secure 24-hour setup link will be emailed to the staff member so they can safely choose their own password.
                </div>
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
                  {inviting ? 'Sending Invite...' : 'Send Setup Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
