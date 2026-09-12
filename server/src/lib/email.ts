import { logger } from './logger';
import dotenv from 'dotenv';
dotenv.config();
import nodemailer, { Transporter } from 'nodemailer';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Configurable SMTP with dev fallback
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // Stream transport for dev console logging
      transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
      });
    }
  }
  return transporter;
}

/**
 * Universal email dispatcher: Resend API -> SMTP -> Dev fallback
 */
export async function sendEmailMessage(options: {
  from?: string;
  to: string;
  subject: string;
  text?: string;
  html: string;
}): Promise<void> {
  const fromAddress =
    process.env.EMAIL_FROM ||
    options.from ||
    process.env.SMTP_FROM ||
    'Bespoke Bookings <onboarding@resend.dev>';

  // 1. Direct Resend API Delivery
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [options.to],
          subject: options.subject,
          text: options.text,
          html: options.html,
        }),
      });

      const data = (await res.json()) as any;
      if (res.ok) {
        logger.info({ to: options.to, emailId: data.id }, '📧 [EMAIL SENT VIA RESEND]');
        return;
      } else {
        logger.warn({ to: options.to, notice: data.message }, '⚠️ [Resend Notice]');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to send email via Resend API');
    }
  }

  // 2. SMTP Delivery (if SMTP credentials provided)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const mailer = getTransporter();
      await mailer.sendMail({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      return;
    } catch (err) {
      logger.error({ err }, 'Failed to send email via SMTP');
    }
  }

  // 3. Fallback Dev Transport
  try {
    const mailer = getTransporter();
    await mailer.sendMail({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  } catch (err) {
    logger.error({ err }, 'Dev email error');
  }
}

/**
 * Sends a 6-digit verification OTP to the registering tenant
 */
export async function sendRegistrationOtp(email: string, otp: string, businessName: string): Promise<void> {
  const mailer = getTransporter();

  const isDev = !process.env.SMTP_HOST && !process.env.RESEND_API_KEY;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px;">
      <div style="margin-bottom: 24px; border-bottom: 1px solid #F1F5F9; padding-bottom: 16px;">
        <span style="font-size: 18px; font-weight: 700; color: #0F172A; letter-spacing: -0.02em;">Bespoke Bookings</span>
      </div>
      <h2 style="font-size: 22px; color: #0F172A; margin-bottom: 8px;">Verify your business email</h2>
      <p style="font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 24px;">
        Thank you for registering <strong>${businessName || 'your business'}</strong>. Please enter the following 6-digit verification code to confirm your email address and activate your booking portal:
      </p>
      
      <div style="text-align: center; margin: 32px 0;">
        <div style="display: inline-block; padding: 16px 36px; background-color: #F8FAFC; border: 2px dashed #CBD5E1; border-radius: 8px; font-size: 32px; font-weight: 700; letter-spacing: 0.25em; color: #2563EB; font-family: monospace;">
          ${otp}
        </div>
        <div style="font-size: 12px; color: #94A3B8; margin-top: 8px;">
          Valid for 10 minutes &bull; Do not share this code
        </div>
      </div>

      <p style="font-size: 13px; color: #64748B; line-height: 1.5;">
        If you did not request this code, you can safely ignore this email.
      </p>

      <div style="margin-top: 32px; border-top: 1px solid #F1F5F9; padding-top: 16px; font-size: 11px; color: #94A3B8;">
        &copy; 2026 Bespoke Bookings Platform &bull; Multi-Tenant Resource & Rental System
      </div>
    </div>
  `;

  if (isDev) {
    console.log('\n--------------------------------------------------');
    console.log(`📧 [DEV EMAIL] Registration OTP for: ${email}`);
    console.log(`🏢 Business: ${businessName}`);
    console.log(`🔑 Verification Code: ${otp}`);
    console.log('──────────────────────────────────────────────────\n');
  }

  try {
    await sendEmailMessage({
      from: process.env.SMTP_FROM || '"Bespoke Bookings" <noreply@bespokebookings.com>',
      to: email,
      subject: `Your Verification Code: ${otp} - ${businessName || 'Bespoke Bookings'}`,
      text: `Your verification code is: ${otp}. It will expire in 10 minutes.`,
      html,
    });
  } catch (err) {
    console.error('Failed to send registration OTP email:', err);
  }
}

/**
 * Sends a welcome email with both public customer link and admin dashboard link
 */
export async function sendWelcomeBusinessEmail(email: string, businessName: string, slug: string): Promise<void> {
  const mailer = getTransporter();
  const isDev = !process.env.SMTP_HOST && !process.env.RESEND_API_KEY;

  const publicUrl = `${CLIENT_URL}/${slug}`;
  const adminUrl = `${CLIENT_URL}/${slug}/admin`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 36px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px;">
      <div style="margin-bottom: 24px; border-bottom: 1px solid #F1F5F9; padding-bottom: 18px;">
        <span style="font-size: 20px; font-weight: 700; color: #0F172A; letter-spacing: -0.02em;">Bespoke Bookings</span>
      </div>

      <h1 style="font-size: 24px; color: #0F172A; margin-bottom: 12px; font-weight: 700;">
        🎉 Welcome to the Platform, ${businessName}!
      </h1>

      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 24px;">
        Your custom multi-tenant booking portal is officially live. Below are your dedicated links to share with customers and manage operations:
      </p>

      {/* Public Booking Link Card */}
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
        <div style="font-size: 12px; font-weight: 700; color: #2563EB; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
          🌐 Public Customer Booking Portal
        </div>
        <div style="font-size: 13px; color: #475569; margin-bottom: 12px;">
          Share this link with your clients to book slots, courts, equipment, or rentals:
        </div>
        <a href="${publicUrl}" style="display: inline-block; padding: 10px 18px; background-color: #2563EB; color: #FFFFFF; text-decoration: none; font-size: 13px; font-weight: 600; border-radius: 6px;">
          Open Customer Portal &rarr;
        </a>
        <div style="font-size: 12px; color: #64748B; margin-top: 8px; font-family: monospace;">
          ${publicUrl}
        </div>
      </div>

      {/* Admin Dashboard Link Card */}
      <div style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 20px; margin-bottom: 28px;">
        <div style="font-size: 12px; font-weight: 700; color: #0F172A; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
          🛡️ Private Business Dashboard
        </div>
        <div style="font-size: 13px; color: #475569; margin-bottom: 12px;">
          Manage your schedule, inventory, reservations, team members, and revenue:
        </div>
        <a href="${adminUrl}" style="display: inline-block; padding: 10px 18px; background-color: #0F172A; color: #FFFFFF; text-decoration: none; font-size: 13px; font-weight: 600; border-radius: 6px;">
          Access Business Portal &rarr;
        </a>
        <div style="font-size: 12px; color: #64748B; margin-top: 8px; font-family: monospace;">
          ${adminUrl}
        </div>
      </div>

      <div style="background-color: #EFF6FF; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #1E40AF; margin-bottom: 6px;">
          ⚡ Quick Next Steps:
        </div>
        <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #1E3A8A; line-height: 1.6;">
          <li>Add your bookable resources (e.g. courts, bikes, spaces) and set hourly rates.</li>
          <li>Set up custom operating days and buffer intervals.</li>
          <li>Upload your brand logo for custom branding.</li>
        </ol>
      </div>

      <div style="border-top: 1px solid #F1F5F9; padding-top: 20px; font-size: 12px; color: #94A3B8;">
        This email was sent to ${email} because you registered on Bespoke Bookings.
      </div>
    </div>
  `;

  if (isDev) {
    console.log('\n--------------------------------------------------');
    console.log(`📬 [DEV EMAIL] Welcome Email sent to: ${email}`);
    console.log(`🏢 Business: ${businessName}`);
    console.log(`🌐 Public Portal: ${publicUrl}`);
    console.log(`🛡️ Admin Portal: ${adminUrl}`);
    console.log('──────────────────────────────────────────────────\n');
  }

  try {
    await sendEmailMessage({
      from: process.env.SMTP_FROM || '"Bespoke Bookings" <noreply@bespokebookings.com>',
      to: email,
      subject: `🎉 Your Booking Portal is Ready: ${businessName}`,
      text: `Welcome! Your customer portal is live at: ${publicUrl}\nYour admin dashboard is at: ${adminUrl}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send welcome business email:', err);
  }
}

/**
 * Format a Date object for standard iCalendar UTC strings (YYYYMMDDTHHMMSSZ)
 */
function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Generates an .ics iCalendar file content compatible with Google Calendar, Apple Calendar, and Outlook
 */
export function generateIcsCalendar(params: {
  bookingId: string;
  summary: string;
  description: string;
  location: string;
  startTime: Date;
  endTime: Date;
  customerName: string;
  customerEmail: string;
  organizerName: string;
}): string {
  const dtStamp = formatIcsDateTime(new Date());
  const dtStart = formatIcsDateTime(params.startTime);
  const dtEnd = formatIcsDateTime(params.endTime);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bespoke Bookings//NONSGML v1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${params.bookingId}@bespokebookings.com`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${params.summary}`,
    `DESCRIPTION:${params.description.replace(/\n/g, '\\n')}`,
    `LOCATION:${params.location}`,
    'STATUS:CONFIRMED',
    `ORGANIZER;CN=${params.organizerName}:mailto:noreply@bespokebookings.com`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${params.customerName}:mailto:${params.customerEmail}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${params.summary} starts in 1 hour`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Sends a booking confirmation receipt with an attached .ics calendar invite
 */
export async function sendBookingConfirmationEmail(params: {
  booking: {
    id: string;
    customerName: string;
    customerEmail: string;
    startTime: Date;
    endTime: Date;
    totalAmountCents: number;
  };
  resource: {
    id: string;
    name: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    currency?: string;
    address?: string | null;
    phone?: string | null;
  };
}): Promise<void> {
  const mailer = getTransporter();
  const isDev = !process.env.SMTP_HOST && !process.env.RESEND_API_KEY;

  const { booking, resource, tenant } = params;
  const start = new Date(booking.startTime);
  const end = new Date(booking.endTime);

  const dateStr = start.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const timeStr = `${start.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true })} - ${end.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true })}`;
  const totalInr = (booking.totalAmountCents / 100).toFixed(2);
  const myBookingsUrl = `${CLIENT_URL}/${tenant.slug}`;
  const gCalDates = `${start.toISOString().replace(/[-:]/g, '').split('.')[0]}Z/${end.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const gCalTitle = encodeURIComponent(`${resource.name} at ${tenant.name}`);
  const gCalDetails = encodeURIComponent(`Confirmed reservation with ${tenant.name}.\nBooking Reference: ${booking.id}\nCustomer: ${booking.customerName}\nManage: ${myBookingsUrl}`);
  const gCalLocation = encodeURIComponent(tenant.address || tenant.name);
  const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${gCalTitle}&dates=${gCalDates}&details=${gCalDetails}&location=${gCalLocation}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px;">
      {/* Header */}
      <div style="margin-bottom: 24px; border-bottom: 1px solid #F1F5F9; padding-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 18px; font-weight: 700; color: #0F172A;">${tenant.name}</span>
        <span style="display: inline-block; padding: 4px 10px; background-color: #DCFCE7; color: #15803D; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
          Confirmed Receipt
        </span>
      </div>

      <h1 style="font-size: 22px; color: #0F172A; margin-bottom: 6px; font-weight: 700;">
        Reservation Confirmed!
      </h1>
      <p style="font-size: 14px; color: #475569; margin-bottom: 24px;">
        Hi ${booking.customerName}, your reservation is confirmed. You can add it directly to your Google Calendar below:
      </p>

      {/* Google Calendar 1-Click Button */}
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${googleCalendarUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #1A73E8; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);">
          📅 Add to Google Calendar &rarr;
        </a>
      </div>

      {/* Summary Card */}
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <div style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px;">
          Reservation Details
        </div>
        
        <div style="font-size: 17px; font-weight: 700; color: #0F172A; margin-bottom: 6px;">
          ${resource.name}
        </div>

        <div style="font-size: 14px; color: #334155; margin-bottom: 16px;">
          📅 <strong>${dateStr}</strong> &bull; ⏰ <strong>${timeStr}</strong>
        </div>

        <div style="border-top: 1px solid #E2E8F0; padding-top: 12px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #64748B;">Booking Reference:</span>
          <span style="font-family: monospace; font-size: 13px; font-weight: 700; color: #0F172A;">
            ${booking.id.slice(0, 8).toUpperCase()}
          </span>
        </div>

        <div style="padding-top: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #64748B;">Total Amount Paid:</span>
          <span style="font-size: 17px; font-weight: 700; color: #2563EB;">
            ₹${totalInr} INR
          </span>
        </div>
      </div>

      {/* CTA Button */}
      <div style="text-align: center; margin-bottom: 28px;">
        <a href="${myBookingsUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0F172A; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px;">
          View & Manage My Bookings &rarr;
        </a>
      </div>

      <div style="border-top: 1px solid #F1F5F9; padding-top: 16px; font-size: 12px; color: #94A3B8; line-height: 1.5;">
        Need to change your booking? You can reschedule or cancel anytime from the <a href="${myBookingsUrl}" style="color: #2563EB;">My Bookings</a> portal.
      </div>
    </div>
  `;

  if (isDev) {
    console.log('\n--------------------------------------------------');
    console.log(`🧾 [DEV EMAIL] Booking Confirmation Receipt sent to: ${booking.customerEmail}`);
    console.log(`🏢 Business: ${tenant.name}`);
    console.log(`📦 Resource: ${resource.name}`);
    console.log(`📅 Date & Time: ${dateStr} at ${timeStr}`);
    console.log(`💰 Paid: ₹${totalInr} INR`);
    console.log(`📅 Google Calendar Link: ${googleCalendarUrl}`);
    console.log('──────────────────────────────────────────────────\n');
  }

  try {
    await sendEmailMessage({
      from: process.env.SMTP_FROM || `"${tenant.name}" <noreply@bespokebookings.com>`,
      to: booking.customerEmail,
      subject: `✅ Booking Confirmed: ${resource.name} at ${tenant.name}`,
      text: `Your reservation for ${resource.name} on ${dateStr} at ${timeStr} is confirmed. Total Paid: ₹${totalInr}. Add to Google Calendar: ${googleCalendarUrl}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send booking confirmation email:', err);
  }
}

/**
 * Sends a booking cancellation confirmation email
 */
export async function sendBookingCancellationEmail(params: {
  booking: {
    id: string;
    customerName: string;
    customerEmail: string;
    startTime: Date;
    endTime: Date;
  };
  resource: {
    name: string;
  };
  tenant: {
    name: string;
    slug: string;
  };
}): Promise<void> {
  const mailer = getTransporter();
  const isDev = !process.env.SMTP_HOST && !process.env.RESEND_API_KEY;

  const { booking, resource, tenant } = params;
  const start = new Date(booking.startTime);
  const dateStr = start.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px;">
      <div style="margin-bottom: 20px; border-bottom: 1px solid #F1F5F9; padding-bottom: 14px;">
        <span style="font-size: 18px; font-weight: 700; color: #0F172A;">${tenant.name}</span>
      </div>

      <h2 style="font-size: 20px; color: #DC2626; margin-bottom: 8px;">Reservation Cancelled</h2>
      <p style="font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 20px;">
        Hi ${booking.customerName}, your booking for <strong>${resource.name}</strong> on <strong>${dateStr}</strong> (Ref: <code>${booking.id.slice(0, 8).toUpperCase()}</code>) has been cancelled.
      </p>

      <p style="font-size: 13px; color: #64748B; line-height: 1.5;">
        The time slot has been released back into availability. If this was a mistake, you can rebook anytime on our portal.
      </p>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #F1F5F9; font-size: 12px; color: #94A3B8;">
        &copy; ${tenant.name} &bull; Powered by Bespoke Bookings
      </div>
    </div>
  `;

  if (isDev) {
    console.log('\n--------------------------------------------------');
    console.log(`❌ [DEV EMAIL] Booking Cancellation sent to: ${booking.customerEmail}`);
    console.log(`🏢 Business: ${tenant.name}`);
    console.log(`📦 Resource: ${resource.name}`);
    console.log(`📅 Date: ${dateStr}`);
    console.log('──────────────────────────────────────────────────\n');
  }

  try {
    await sendEmailMessage({
      from: process.env.SMTP_FROM || `"${tenant.name}" <noreply@bespokebookings.com>`,
      to: booking.customerEmail,
      subject: `❌ Reservation Cancelled: ${resource.name} at ${tenant.name}`,
      text: `Your reservation for ${resource.name} on ${dateStr} has been cancelled.`,
      html,
    });
  } catch (err) {
    console.error('Failed to send booking cancellation email:', err);
  }
}


/**
 * Sends a 6-digit password reset code to a user
 */
export async function sendPasswordResetEmail(email: string, otp: string, businessName = 'Bespoke Bookings'): Promise<void> {
  const isDev = !process.env.SMTP_HOST && !process.env.RESEND_API_KEY;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 36px; background-color: #FAF7F2; border: 1px solid #EBE5DC; border-radius: 8px;">
      <div style="margin-bottom: 24px; border-bottom: 1px solid #E5DFD5; padding-bottom: 16px;">
        <span style="font-size: 20px; font-weight: 700; color: #171717; font-family: Georgia, serif;">${businessName}</span>
      </div>

      <h2 style="font-size: 22px; color: #171717; margin-bottom: 10px; font-family: Georgia, serif; font-weight: 600;">Reset Your Password</h2>
      <p style="font-size: 14px; color: #5C5549; line-height: 1.6; margin-bottom: 24px;">
        We received a request to reset the password for your account associated with <strong>${email}</strong>. Use the 6-digit verification code below to set a new password:
      </p>

      <div style="background-color: #FFFFFF; border: 1px solid #E5DFD5; border-radius: 6px; padding: 24px; text-align: center; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
        <div style="font-size: 11px; font-weight: 700; color: #8A8275; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
          Password Reset Verification Code
        </div>
        <div style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #C1502E; margin: 4px 0;">
          ${otp}
        </div>
        <div style="font-size: 12px; color: #8A8275; margin-top: 8px;">
          This code expires in 15 minutes.
        </div>
      </div>

      <p style="font-size: 13px; color: #7A7265; line-height: 1.5; margin-bottom: 24px;">
        If you did not request this password reset, you can safely ignore this email. Your current password will remain unchanged and your account is secure.
      </p>

      <div style="border-top: 1px solid #E5DFD5; padding-top: 16px; font-size: 12px; color: #A8A297;">
        &copy; ${businessName} &bull; Powered by Bespoke Bookings Platform
      </div>
    </div>
  `;

  if (isDev) {
    console.log('\n--------------------------------------------------');
    console.log(`[DEV EMAIL] Password Reset OTP sent to: ${email}`);
    console.log(`Code: ${otp}`);
    console.log('--------------------------------------------------\n');
  }

  try {
    await sendEmailMessage({
      from: process.env.SMTP_FROM || `"${businessName}" <noreply@bespokebookings.com>`,
      to: email,
      subject: `Reset your password for ${businessName} (Code: ${otp})`,
      text: `Your password reset code for ${businessName} is: ${otp}. It expires in 15 minutes.`,
      html,
    });
  } catch (err) {
    console.error('Failed to send password reset email:', err);
  }
}


/**
 * Staff & Team Member Invitation Email
 * Dispatches an official invite link for staff to set their password
 */
export async function sendStaffInviteEmail(params: {
  email: string;
  staffName: string;
  businessName: string;
  inviterName: string;
  role: string;
  setupUrl: string;
}): Promise<void> {
  const { email, staffName, businessName, inviterName, role, setupUrl } = params;
  const isDev = !process.env.SMTP_HOST && !process.env.RESEND_API_KEY;

  const roleTitle = role === 'ADMIN' ? 'Workspace Administrator' : 'Front-Desk Operations Staff';

  const html = `
    <div style="font-family: 'Georgia', serif; max-width: 580px; margin: 0 auto; background-color: #FAF7F2; border: 1px solid #E5DFD5; border-radius: 4px; padding: 36px; color: #171717;">
      <div style="border-bottom: 2px solid #C1502E; padding-bottom: 16px; margin-bottom: 24px;">
        <span style="font-size: 24px; font-weight: 700; color: #171717; letter-spacing: -0.5px;">
          ${businessName}
        </span>
        <span style="display: block; font-size: 13px; color: #8A8275; margin-top: 4px; font-family: sans-serif;">
          Team Member Invitation
        </span>
      </div>

      <p style="font-size: 16px; line-height: 1.6; margin-bottom: 16px; font-family: sans-serif;">
        Hello <strong>${staffName || 'there'}</strong>,
      </p>

      <p style="font-size: 14px; line-height: 1.6; color: #4A453E; margin-bottom: 24px; font-family: sans-serif;">
        <strong>${inviterName || 'An administrator'}</strong> has invited you to join the team at <strong>${businessName}</strong> as <strong>${roleTitle}</strong>.
      </p>

      <div style="background-color: #FFFFFF; border: 1px solid #E5DFD5; border-radius: 4px; padding: 24px; text-align: center; margin-bottom: 28px;">
        <p style="font-size: 13px; color: #7A7265; margin-bottom: 16px; font-family: sans-serif;">
          Click the button below to set up your account password and activate your workspace access:
        </p>
        <a href="${setupUrl}" style="display: inline-block; background-color: #059669; color: #FFFFFF; padding: 12px 28px; font-family: sans-serif; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 4px;">
          Set Up Password &amp; Join
        </a>
        <div style="font-size: 11px; color: #8A8275; margin-top: 14px; font-family: sans-serif;">
          This invitation link expires in 24 hours.
        </div>
      </div>

      <p style="font-size: 12px; color: #8A8275; font-family: sans-serif; line-height: 1.5; margin-bottom: 24px;">
        If you are unable to click the button above, copy and paste this link into your browser:<br/>
        <a href="${setupUrl}" style="color: #059669; word-break: break-all;">${setupUrl}</a>
      </p>

      <div style="border-top: 1px solid #E5DFD5; padding-top: 16px; font-size: 11px; color: #A8A297; font-family: sans-serif;">
        &copy; ${businessName} &bull; Powered by Bespoke Bookings Multi-Tenant Platform
      </div>
    </div>
  `;

  if (isDev) {
    console.log('\n--------------------------------------------------');
    console.log(`[DEV EMAIL] Staff Invitation sent to: ${email}`);
    console.log(`Role: ${role}`);
    console.log(`Setup URL: ${setupUrl}`);
    console.log('--------------------------------------------------\n');
  }

  try {
    await sendEmailMessage({
      from: process.env.SMTP_FROM || `"${businessName}" <noreply@bespokebookings.com>`,
      to: email,
      subject: `Invitation to join ${businessName} as ${roleTitle}`,
      text: `You have been invited to join ${businessName} as ${roleTitle}. Set up your password here: ${setupUrl} (Link expires in 24h)`,
      html,
    });
  } catch (err) {
    console.error('Failed to send staff invitation email:', err);
  }
}
