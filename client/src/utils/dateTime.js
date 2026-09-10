/**
 * Utility functions for consistent booking date & time formatting across timezones
 */

/**
 * Format a booking timestamp to Date & Time string without timezone shift
 * @param {string|Date} isoString 
 * @returns {string} e.g. "9/9/2026 • 07:00 PM"
 */
export function formatBookingDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';

  const date = d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });

  const time = d.toLocaleTimeString('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return `${date} • ${time}`;
}

/**
 * Format date part only
 */
export function formatBookingDate(isoString, options = {}) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';

  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    ...options,
  });
}

/**
 * Format time part only
 */
export function formatBookingTime(isoString, options = {}) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';

  return d.toLocaleTimeString('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  });
}

/**
 * Format slot range e.g. "Wed, Sep 9, 2026" and "07:00 PM - 08:00 PM"
 */
export function formatBookingSlotRange(startIso, endIso) {
  if (!startIso) return { dateFormatted: '', timeRange: '' };
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;

  const dateFormatted = start.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const startTime = start.toLocaleTimeString('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const endTime = end && !isNaN(end.getTime())
    ? end.toLocaleTimeString('en-US', {
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : '';

  return {
    dateFormatted,
    timeRange: endTime ? `${startTime} - ${endTime}` : startTime,
  };
}
