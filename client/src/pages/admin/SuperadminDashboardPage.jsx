import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import {
  RotateCw,
  Building2,
  IndianRupee,
  CalendarCheck,
  Users,
  Layers,
  Plus,
  LogOut,
  ExternalLink,
  Shield,
  Search,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

export default function SuperadminDashboardPage() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  // New Tenant Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    currency: 'INR',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  });

  useEffect(() => {
    const token = localStorage.getItem('saas_auth_token');
    const userStr = localStorage.getItem('saas_auth_user');

    if (!token) {
      navigate('/login');
      return;
    }

    if (userStr) {
      try {
        const parsed = JSON.parse(userStr);
        setCurrentUser(parsed);
      } catch {
        // ignore
      }
    }

    loadSuperadminData();
  }, []);

  const loadSuperadminData = async () => {
    setLoading(true);
    try {
      const [metricsRes, tenantsRes] = await Promise.all([
        api.get('/superadmin/metrics'),
        api.get('/superadmin/tenants'),
      ]);

      setMetrics(metricsRes.data.metrics);
      setTenants(tenantsRes.data.tenants || []);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to load platform data';
      toast.error(errorMsg);
      if (err.response?.status === 401 || err.response?.status === 403) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('saas_auth_token');
    localStorage.removeItem('saas_auth_user');
    toast.success('Signed out of Superadmin Console');
    navigate('/login');
  };

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.slug || !formData.adminEmail || !formData.adminPassword) {
      toast.error('Please fill in all required fields');
      return;
    }

    setModalSubmitting(true);
    try {
      await api.post('/superadmin/tenants', formData);
      toast.success(`Tenant "${formData.name}" created successfully!`);
      setIsModalOpen(false);
      setFormData({
        name: '',
        slug: '',
        currency: 'INR',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
      });
      loadSuperadminData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to provision tenant');
    } finally {
      setModalSubmitting(false);
    }
  };

  const filteredTenants = tenants.filter((t) => {
    const q = searchQuery.toLowerCase();
    return (
      t.name?.toLowerCase().includes(q) ||
      t.slug?.toLowerCase().includes(q) ||
      t.currency?.toLowerCase().includes(q)
    );
  });

  const totalGmvFormatted = metrics
    ? (metrics.totalGmvCents / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text-primary)' }}>
      {/* Top Superadmin Navigation Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          backgroundColor: '#FFFFFF',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--accent)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Shield size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h1 style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-serif)', margin: 0 }}>
                    Platform Superadmin
                  </h1>
                  <span
                    style={{
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      backgroundColor: 'var(--accent-light)',
                      color: 'var(--accent)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 600,
                    }}
                  >
                    Global Console
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Multi-tenant ecosystem analytics and resource directory
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: 'var(--accent)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Plus size={15} />
              Provision Tenant
            </button>

            <button
              onClick={loadSuperadminData}
              title="Refresh Platform Data"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                backgroundColor: 'var(--bg-alt)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              <RotateCw size={15} className={loading ? 'spin' : ''} />
            </button>

            <button
              onClick={handleLogout}
              title="Sign Out"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }}>
        {/* KPI Aggregate Metric Cards */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px',
            marginBottom: '32px',
          }}
        >
          {/* Card 1: Total Tenants */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                Active Businesses
              </span>
              <Building2 size={18} color="var(--accent)" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>
              {loading ? '...' : metrics?.totalTenants ?? 0}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={12} />
              100% Database Isolated
            </span>
          </div>

          {/* Card 2: Platform GMV */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                Platform Gross Volume
              </span>
              <IndianRupee size={18} color="var(--accent)" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>
              {"₹"}{loading ? '...' : totalGmvFormatted}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Total confirmed booking revenue
            </span>
          </div>

          {/* Card 3: Global Bookings */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                Total Bookings
              </span>
              <CalendarCheck size={18} color="var(--accent)" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>
              {loading ? '...' : metrics?.totalBookings ?? 0}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {metrics?.confirmedBookings ?? 0} successfully confirmed
            </span>
          </div>

          {/* Card 4: Total Resources */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                Resources Listed
              </span>
              <Layers size={18} color="var(--accent)" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>
              {loading ? '...' : metrics?.totalResources ?? 0}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {metrics?.totalUsers ?? 0} platform team accounts
            </span>
          </div>
        </section>

        {/* Directory Section Header & Search */}
        <section
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, fontFamily: 'var(--font-serif)' }}>
                Platform Tenant Directory
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                All businesses onboarded onto this multi-tenant engine
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 12px',
                }}
              >
                <Search size={14} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Filter by name, slug..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    border: 'none',
                    backgroundColor: 'transparent',
                    outline: 'none',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    width: '180px',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={13} color="var(--text-muted)" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-alt)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Business Name</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Routing Slug</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Resources</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Bookings</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Team Users</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)' }}>Created</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                      {loading ? 'Loading platform directory...' : 'No businesses match the search criteria.'}
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Building2 size={16} color="var(--accent)" />
                          <span>{t.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        /{t.slug}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            backgroundColor: 'var(--bg-alt)',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          {t._count?.resources ?? 0} resources
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            backgroundColor: 'var(--bg-alt)',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          {t._count?.bookings ?? 0} bookings
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {t._count?.users ?? 1} staff
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-muted)', fontSize: '12px' }}>
                        {new Date(t.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                          <Link
                            to={`/${t.slug}`}
                            target="_blank"
                            style={{
                              fontSize: '12px',
                              fontWeight: 500,
                              padding: '5px 10px',
                              borderRadius: 'var(--radius-xs)',
                              border: '1px solid var(--border)',
                              backgroundColor: '#FFFFFF',
                              color: 'var(--text-primary)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <ExternalLink size={12} />
                            Portal
                          </Link>
                          <Link
                            to={`/${t.slug}/admin`}
                            style={{
                              fontSize: '12px',
                              fontWeight: 500,
                              padding: '5px 10px',
                              borderRadius: 'var(--radius-xs)',
                              border: '1px solid var(--accent)',
                              backgroundColor: 'var(--accent-light)',
                              color: 'var(--accent)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            Admin Console
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Provision Tenant Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={20} color="var(--accent)" />
                <h3 style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-serif)', margin: 0 }}>
                  Provision New Tenant
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} color="var(--text-muted)" />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Tennis Academy"
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                    setFormData((prev) => ({ ...prev, name, slug: prev.slug ? prev.slug : slug }));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Tenant Slug (URL path) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. apex-tennis"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Customer URL will be: bespoke.com/{formData.slug || 'slug'}
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Admin Contact Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={formData.adminName}
                  onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Admin Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@business.com"
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={formData.adminPassword}
                  onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--bg-alt)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: 'var(--accent)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: modalSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {modalSubmitting ? 'Provisioning...' : 'Create Business'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
