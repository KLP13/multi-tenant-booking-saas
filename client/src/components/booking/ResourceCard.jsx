import React from 'react';
import { Users, Clock, ArrowRight } from 'lucide-react';

export default function ResourceCard({ resource, currency = 'INR', onSelect, isSelected }) {
  const formattedRate = (resource.hourlyRateCents / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    minimumFractionDigits: 0,
  });

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-xs)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'var(--transition)',
        boxShadow: isSelected ? '0 0 0 1px var(--accent)' : 'none',
        position: 'relative',
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '500' }}>{resource.name}</h3>
          <div className="mono" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent)' }}>
            {formattedRate}<span style={{ fontSize: '12px', fontWeight: '400', color: 'var(--text-secondary)' }}>/hr</span>
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', minHeight: '40px', lineHeight: '1.5' }}>
          {resource.description || 'Dedicated space with full amenities and equipment for your creative session.'}
        </p>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Users size={14} /> {resource.capacity > 1 ? `Fleet of ${resource.capacity} units` : '1-on-1 Exclusive'}
          </span>
          {resource.bufferMinutes > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={14} /> {resource.bufferMinutes}m prep buffer
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onSelect(resource)}
        className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'}`}
        style={{ width: '100%' }}
      >
        {isSelected ? 'Viewing Schedule' : 'Check Open Times'} <ArrowRight size={14} />
      </button>
    </div>
  );
}
