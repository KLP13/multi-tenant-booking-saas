import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Calendar as CalendarIcon, Clock, CheckCircle2, Lock } from 'lucide-react';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function SlotGrid({ resource, onSelectSlot, selectedSlot }) {
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [closedMessage, setClosedMessage] = useState('');
  const [showConcluded, setShowConcluded] = useState(false);

  // Generate next 7 days for quick tabs using user's local timezone
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = getLocalDateString(d);
    const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNumber = d.getDate();
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    return { dateStr, dayName, dayNumber, month };
  });

  const fetchSlots = async (date) => {
    try {
      setLoading(true);
      const res = await api.get(`/resources/${resource.id}/slots?date=${date}`);
      setIsClosed(res.data.isClosed || false);
      setClosedMessage(res.data.message || '');
      setSlots(res.data.slots || []);
    } catch (err) {
      console.error('Failed to load slots:', err);
      setSlots([]);
      setIsClosed(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (resource?.id) {
      fetchSlots(selectedDate);
    }
  }, [resource?.id, selectedDate]);

  // Check if a slot is in the past relative to current local time
  const isSlotPast = (dateStr, startTimeStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = startTimeStr.split(':').map(Number);
    const slotDateTime = new Date(y, m - 1, d, h, min, 0);
    return slotDateTime <= new Date();
  };

  const isToday = selectedDate === getLocalDateString();

  const processedSlots = slots.map((slot) => {
    const isPast = isSlotPast(selectedDate, slot.startTime);
    return {
      ...slot,
      isPast,
    };
  });

  const upcomingSlots = processedSlots.filter((s) => !s.isPast);
  const pastSlots = processedSlots.filter((s) => s.isPast);
  const displayedSlots = isToday && !showConcluded ? upcomingSlots : processedSlots;

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xs)',
      padding: '28px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h4 style={{ fontSize: '18px', fontWeight: '500' }}>Select Date &amp; Time</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Slots are held exclusively for 10 minutes upon selection while you checkout.
          </p>
        </div>
        <button
          onClick={() => fetchSlots(selectedDate)}
          className="btn btn-ghost"
          style={{ fontSize: '12px' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Date selector pills */}
      <div style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '12px',
        marginBottom: '24px',
      }}>
        {dates.map((d) => {
          const isCurrent = d.dateStr === selectedDate;
          return (
            <button
              key={d.dateStr}
              onClick={() => {
                setSelectedDate(d.dateStr);
                setShowConcluded(false);
              }}
              style={{
                flex: '0 0 auto',
                padding: '10px 16px',
                borderRadius: 'var(--radius-xs)',
                border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                backgroundColor: isCurrent ? 'var(--accent)' : 'transparent',
                color: isCurrent ? '#FFFFFF' : 'var(--text-primary)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'var(--transition)',
              }}
            >
              <div style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8 }}>{d.dayName}</div>
              <div className="mono" style={{ fontSize: '16px', fontWeight: '700' }}>{d.dayNumber} {d.month}</div>
            </button>
          );
        })}
      </div>

      {/* Slots grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Checking live availability...
        </div>
      ) : isClosed ? (
        <div style={{
          padding: '48px 24px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-alt)',
          borderRadius: 'var(--radius-xs)',
          border: '1px dashed var(--border)',
        }}>
          <CalendarIcon size={32} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
          <h5 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '6px' }}>
            {closedMessage || 'Closed on this Day'}
          </h5>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '380px', margin: '0 auto' }}>
            This resource does not operate on this day according to its weekly schedule. Please select another date above.
          </p>
        </div>
      ) : isToday && upcomingSlots.length === 0 && pastSlots.length > 0 && !showConcluded ? (
        <div style={{
          padding: '40px 24px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-alt)',
          borderRadius: 'var(--radius-xs)',
          border: '1px dashed var(--border)',
        }}>
          <Clock size={32} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
          <h5 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '6px' }}>
            All Slots for Today Have Concluded
          </h5>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 16px' }}>
            Operating hours for today have ended. Please select tomorrow or a future date to book this item.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => setSelectedDate(dates[1]?.dateStr)}
              className="btn btn-primary"
              style={{ fontSize: '13px', padding: '8px 18px' }}
            >
              View Tomorrow's Slots &rarr;
            </button>
            <button
              type="button"
              onClick={() => setShowConcluded(true)}
              className="btn btn-outline"
              style={{ fontSize: '13px', padding: '8px 14px' }}
            >
              Show Concluded Slots
            </button>
          </div>
        </div>
      ) : displayedSlots.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No bookable time slots available on this date.
        </div>
      ) : (
        <>
          <div className="slot-grid">
            {displayedSlots.map((slot) => {
              const isSelected = selectedSlot?.startTime === slot.startTime && selectedSlot?.date === selectedDate;
              const isPast = slot.isPast;
              const isBooked = slot.status === 'booked';
              const isLocked = slot.status === 'locked';
              const isBlocked = slot.status === 'blocked';
              const isUnavailable = isPast || isBooked || isLocked || isBlocked;

              return (
                <div
                  key={slot.startTime}
                  onClick={() => {
                    if (!isUnavailable) {
                      onSelectSlot(slot, selectedDate);
                    }
                  }}
                  className={`slot-card ${isSelected ? 'selected' : ''} ${isPast ? 'slot-past' : ''} ${isBooked ? 'slot-booked' : ''} ${isLocked ? 'slot-locked' : ''} ${isBlocked ? 'slot-booked' : ''}`}
                >
                  <div className="slot-time">{slot.startTime}</div>
                  <div className="slot-sub">until {slot.endTime}</div>

                  <div style={{ marginTop: '8px' }}>
                    {isPast ? (
                      <span className="badge" style={{ backgroundColor: '#F1F5F9', color: '#64748B', borderColor: '#CBD5E1' }}>
                        Concluded
                      </span>
                    ) : isBlocked ? (
                      <span className="badge badge-booked" title={slot.reason || 'Blocked by business'}>
                        Unavailable
                      </span>
                    ) : isBooked ? (
                      <span className="badge badge-booked">
                        {slot.totalCapacity > 1 ? 'Sold Out' : 'Booked'}
                      </span>
                    ) : isLocked ? (
                      <span className="badge badge-locked" title="All available spots are temporarily held by customers in checkout">
                        <Lock size={10} /> {slot.totalCapacity > 1 ? 'All Held' : 'Held'}
                      </span>
                    ) : isSelected ? (
                      <span className="badge badge-available" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#FFFFFF', borderColor: 'transparent' }}>
                        <CheckCircle2 size={10} /> Selected
                      </span>
                    ) : slot.totalCapacity > 1 ? (
                      slot.remainingCapacity === 1 ? (
                        <span className="badge badge-locked" style={{ backgroundColor: '#FEF3C7', color: '#B45309', borderColor: '#FDE68A', fontWeight: '600' }}>
                          Only 1 left!
                        </span>
                      ) : (
                        <span className="badge badge-available" style={{ fontWeight: '600' }}>
                          {slot.remainingCapacity} of {slot.totalCapacity} left
                        </span>
                      )
                    ) : (
                      <span className="badge badge-available">Available</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Context footer when viewing today with past slots */}
          {isToday && pastSlots.length > 0 && (
            <div style={{
              marginTop: '18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              backgroundColor: 'var(--bg-alt)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}>
              <span>
                🕒 Showing upcoming slots ({upcomingSlots.length} available &bull; {pastSlots.length} earlier slots concluded)
              </span>
              <button
                type="button"
                onClick={() => setShowConcluded(!showConcluded)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                {showConcluded ? 'Hide Concluded Slots' : `Show Concluded (${pastSlots.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
