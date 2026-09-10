import React, { useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import { useSlotLock } from '../../hooks/useSlotLock';
import TenantHeader from '../../components/layout/TenantHeader';
import ResourceCard from '../../components/booking/ResourceCard';
import SlotGrid from '../../components/booking/SlotGrid';
import CheckoutDrawer from '../../components/booking/CheckoutDrawer';
import BookingModal from '../../components/booking/BookingModal';
import { Sparkles, Calendar, Clock, Shield, MapPin, ExternalLink } from 'lucide-react';

export default function TenantBookingPage() {
  const { tenant, resources, loading, error } = useTenant();
  const [selectedResource, setSelectedResource] = useState(null);
  const [checkoutSlot, setCheckoutSlot] = useState(null);
  const [slotRefreshKey, setSlotRefreshKey] = useState(0);

  const lockState = useSlotLock();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: '20px' }}>Loading studio catalog...</p>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div style={{ minHeight: '100vh', padding: '80px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '28px', marginBottom: '12px' }}>Studio Not Found</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{error || 'This booking portal does not exist.'}</p>
      </div>
    );
  }

  // Handle user clicking an open slot in SlotGrid
  const handleSlotSelect = async (slot, date) => {
    const res = await lockState.acquireSlotLock(selectedResource.id, date, slot.startTime);
    if (res?.success) {
      setCheckoutSlot({
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    }
  };

  const handleCheckoutClose = () => {
    setCheckoutSlot(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TenantHeader />

      {/* Hero Section */}
      <section style={{
        padding: '56px 0 40px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-alt)',
      }}>
        <div className="container">
          <div style={{ maxWidth: '720px' }}>
            <span className="badge badge-available" style={{ marginBottom: '14px' }}>
              <Sparkles size={12} /> Instant Online Booking
            </span>
            <h1 style={{ fontSize: '38px', marginBottom: '16px', letterSpacing: '-0.02em' }}>
              Reserve with {tenant.name}.
            </h1>
            <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              Browse available spaces, equipment, and rentals. Select an open time slot to reserve it with zero risk of double-booking.
            </p>
            {tenant.address && (
              <div style={{
                marginTop: '16px',
                display: 'inline-flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                padding: '6px 14px',
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '13px',
                color: 'var(--text-primary)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}>
                <MapPin size={15} color="#DC2626" />
                <span style={{ fontWeight: '500' }}>{tenant.address}</span>
                <span style={{ color: '#CBD5E1' }}>&bull;</span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tenant.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#2563EB',
                    fontWeight: '600',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    textDecoration: 'none',
                  }}
                >
                  View on Google Maps <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="container" style={{ padding: '48px 24px', flex: '1' }}>
        {/* Step 1: Resource List */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '24px' }}>1. Select a Resource</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Choose the space, item, or rental you wish to book.
              </p>
            </div>
            <span className="mono" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {resources.length} Items Available
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}>
            {resources.map((res) => (
              <ResourceCard
                key={res.id}
                resource={res}
                currency={tenant.currency}
                isSelected={selectedResource?.id === res.id}
                onSelect={(r) => {
                  setSelectedResource(r);
                  // Scroll down smoothly to schedule
                  setTimeout(() => {
                    document.getElementById('schedule-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
              />
            ))}
          </div>
        </div>

        {/* Step 2: Slot Grid Calendar (appears once resource is selected) */}
        {selectedResource && (
          <div id="schedule-section" style={{ paddingTop: '20px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '24px' }}>2. Available Hours for {selectedResource.name}</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Click an open slot to temporarily reserve it for 10 minutes.
              </p>
            </div>

            <SlotGrid
              resource={selectedResource}
              selectedSlot={lockState.lockedSlot}
              onSelectSlot={handleSlotSelect}
            />
          </div>
        )}
      </main>

      {/* Checkout Drawer when slot is locked */}
      {checkoutSlot && selectedResource && (
        <CheckoutDrawer
          resource={selectedResource}
          slot={checkoutSlot}
          tenant={tenant}
          lockState={lockState}
          onClose={handleCheckoutClose}
          onBookingSuccess={() => {
            // Keep open to show receipt
          }}
        />
      )}

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '32px 0',
        backgroundColor: 'var(--bg)',
        textAlign: 'center',
        fontSize: '13px',
        color: 'var(--text-secondary)',
      }}>
        <div className="container">
          <p>© {new Date().getFullYear()} {tenant.name} &bull; Powered by Multi-Tenant Booking SaaS</p>
        </div>
      </footer>
    </div>
  );
}
