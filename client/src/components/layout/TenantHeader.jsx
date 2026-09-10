import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTenant } from '../../context/TenantContext';
import { Compass, Ticket } from 'lucide-react';
import CustomerBookingsModal from '../booking/CustomerBookingsModal';

export default function TenantHeader() {
  const { tenant, tenantSlug } = useTenant();
  const navigate = useNavigate();
  const [showBookingsModal, setShowBookingsModal] = useState(false);
  const [customer, setCustomer] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('bespoke_customer_profile');
      if (saved) setCustomer(JSON.parse(saved));
    } catch (e) {
      // ignore
    }
  }, [showBookingsModal]);

  return (
    <header className="editorial-header">
      <div className="container editorial-header-inner">
        <Link to={`/${tenantSlug}`} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {tenant?.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={tenant.name}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '4px',
                objectFit: 'cover',
                border: '1px solid var(--border)',
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div style={{
              width: '38px',
              height: '38px',
              backgroundColor: 'var(--accent)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '3px',
              fontFamily: 'var(--font-serif)',
              fontSize: '19px',
              fontWeight: '600',
            }}>
              {tenant?.name?.charAt(0) || 'B'}
            </div>
          )}
          <div>
            <h2 style={{ fontSize: '20px', letterSpacing: '-0.01em' }}>
              {tenant?.name || 'Online Bookings'}
            </h2>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Official Booking Portal &bull; {tenant?.currency || 'INR'}
            </div>
          </div>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link to={`/${tenantSlug}`} className="btn btn-ghost" style={{ fontSize: '13px' }}>
            <Compass size={16} /> All Bookable Items
          </Link>

          <button
            onClick={() => setShowBookingsModal(true)}
            className="btn btn-outline"
            style={{
              fontSize: '13px',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderColor: customer ? 'var(--accent)' : 'var(--border)',
              backgroundColor: customer ? 'rgba(37, 99, 235, 0.04)' : '#FFFFFF',
            }}
          >
            <Ticket size={16} color="var(--accent)" />
            {customer?.name ? (
              <span>My Bookings ({customer.name.split(' ')[0]})</span>
            ) : (
              <span>My Bookings</span>
            )}
          </button>

          
        </nav>
      </div>

      <CustomerBookingsModal
        tenantSlug={tenantSlug}
        isOpen={showBookingsModal}
        onClose={() => setShowBookingsModal(false)}
      />
    </header>
  );
}

