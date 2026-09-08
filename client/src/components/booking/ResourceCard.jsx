import React from 'react';
import { Users, Clock, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

export default function ResourceCard({ resource, currency = 'INR', onSelect, isSelected }) {
  const formattedRate = (resource.hourlyRateCents / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    minimumFractionDigits: 0,
  });

  const isHighCapacity = (resource.capacity || 1) > 5;
  const isExclusive = (resource.capacity || 1) === 1;

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
        transition: 'all 0.2s ease-in-out',
        boxShadow: isSelected
          ? '0 4px 16px rgba(0, 0, 0, 0.08), 0 0 0 1px var(--accent)'
          : '0 1px 3px rgba(0, 0, 0, 0.04)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top Banner Tag for Resource Type */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: '600',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            padding: '3px 8px',
            borderRadius: '4px',
            backgroundColor: isExclusive ? '#EEF2FF' : isHighCapacity ? '#FEF3C7' : '#F3F4F6',
            color: isExclusive ? '#4F46E5' : isHighCapacity ? '#92400E' : '#374151',
          }}
        >
          {isExclusive ? <ShieldCheck size={12} /> : isHighCapacity ? <Sparkles size={12} /> : null}
          {isExclusive ? 'Exclusive Space' : isHighCapacity ? 'Group Space' : 'Shared Resource'}
        </span>

        {resource.openTime && resource.closeTime && (
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Clock size={11} /> {resource.openTime} - {resource.closeTime}
          </span>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: '600', color: 'var(--text-primary)', lineHeight: '1.3' }}>
            {resource.name}
          </h3>
          <div className="mono" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent)', whiteSpace: 'nowrap', marginLeft: '12px' }}>
            {formattedRate}
            <span style={{ fontSize: '12px', fontWeight: '400', color: 'var(--text-secondary)' }}>/hr</span>
          </div>
        </div>

        <p
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            marginBottom: '18px',
            minHeight: '38px',
            lineHeight: '1.5',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {resource.description || 'Dedicated space with full amenities, power connectivity, and equipment for your session.'}
        </p>

        {/* Feature Tags */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginBottom: '20px',
            paddingTop: '12px',
            borderTop: '1px solid #F3F4F6',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Users size={14} color="var(--accent)" />
            <strong>{resource.capacity > 1 ? `Fleet of ${resource.capacity} units` : '1-on-1 Exclusive'}</strong>
          </span>

          {resource.bufferMinutes > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={14} /> {resource.bufferMinutes}m prep buffer
            </span>
          )}

          {resource.slotDurationMinutes && (
            <span style={{ fontSize: '11px', backgroundColor: '#F9FAFB', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E5E7EB' }}>
              {resource.slotDurationMinutes}m slots
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onSelect(resource)}
        className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'}`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '10px 16px',
          fontWeight: '500',
        }}
      >
        {isSelected ? 'Viewing Schedule' : 'Check Open Times'} <ArrowRight size={14} />
      </button>
    </div>
  );
}
