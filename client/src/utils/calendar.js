/**
 * Calendar utilities for Google Calendar and Apple/Outlook .ics export
 */

export function generateGoogleCalendarUrl({ title, description, location, date, startTime, endTime, startIso, endIso }) {
  try {
    let startDt;
    let endDt;

    if (startIso && endIso) {
      startDt = new Date(startIso);
      endDt = new Date(endIso);
    } else if (date && startTime && endTime) {
      const [startH = '00', startM = '00'] = String(startTime).split(':');
      const [endH = '00', endM = '00'] = String(endTime).split(':');
      startDt = new Date(`${date}T${startH.padStart(2, '0')}:${startM.padStart(2, '0')}:00.000Z`);
      endDt = new Date(`${date}T${endH.padStart(2, '0')}:${endM.padStart(2, '0')}:00.000Z`);
    } else if (startTime && endTime) {
      startDt = new Date(startTime);
      endDt = new Date(endTime);
    } else {
      startDt = new Date();
      endDt = new Date(Date.now() + 60 * 60 * 1000);
    }

    if (isNaN(startDt.getTime())) startDt = new Date();
    if (isNaN(endDt.getTime())) endDt = new Date(startDt.getTime() + 60 * 60 * 1000);

    const formatGoogle = (dt) => {
      return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const datesParam = `${formatGoogle(startDt)}/${formatGoogle(endDt)}`;

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title || 'Booking Reservation',
      dates: datesParam,
      details: description || '',
      location: location || '',
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  } catch (err) {
    console.error('Failed to generate Google Calendar URL:', err);
    return '#';
  }
}

export function downloadIcsFile({ title, description, location, date, startTime, endTime, startIso, endIso, bookingRef }) {
  try {
    let startDt;
    let endDt;

    if (startIso && endIso) {
      startDt = new Date(startIso);
      endDt = new Date(endIso);
    } else if (date && startTime && endTime) {
      const [startH = '00', startM = '00'] = String(startTime).split(':');
      const [endH = '00', endM = '00'] = String(endTime).split(':');
      startDt = new Date(`${date}T${startH.padStart(2, '0')}:${startM.padStart(2, '0')}:00.000Z`);
      endDt = new Date(`${date}T${endH.padStart(2, '0')}:${endM.padStart(2, '0')}:00.000Z`);
    } else {
      startDt = new Date();
      endDt = new Date(Date.now() + 60 * 60 * 1000);
    }

    if (isNaN(startDt.getTime())) startDt = new Date();
    if (isNaN(endDt.getTime())) endDt = new Date(startDt.getTime() + 60 * 60 * 1000);

    const formatIcs = (dt) => {
      return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Bespoke Bookings//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${bookingRef || Date.now()}@bespokebookings.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatIcs(startDt)}`,
      `DTEND:${formatIcs(endDt)}`,
      `SUMMARY:${title || 'Reservation'}`,
      `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
      `LOCATION:${location || ''}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `booking-${(bookingRef || 'invite').slice(0, 8)}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to download .ics file:', err);
  }
}
