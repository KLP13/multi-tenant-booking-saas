import { z } from 'zod';

// ==========================================
// 1. Primitive Reusable Schemas
// ==========================================

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const slugSchema = z
  .string()
  .trim()
  .min(2, 'Slug must be at least 2 characters')
  .max(64, 'Slug must be at most 64 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must only contain lowercase alphanumeric characters and single hyphens');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address')
  .max(255, 'Email too long');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const timeStringSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:mm 24-hour format (e.g. 09:00, 18:30)');

export const dateStringSchema = z
  .string()
  .trim()
  .refine(
    (val) => {
      if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(val)) return true;
      if (/^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])-\d{4}$/.test(val)) return true;
      return false;
    },
    { message: 'Date must be in YYYY-MM-DD or DD-MM-YYYY format' }
  )
  .transform((val) => {
    if (/^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])-\d{4}$/.test(val)) {
      const [d, m, y] = val.split('-');
      return `${y}-${m}-${d}`;
    }
    return val;
  });

export const isoDateTimeSchema = z
  .string()
  .trim()
  .refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid ISO 8601 date-time string',
  });

export const VALID_OPERATING_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

export const operatingDaysSchema = z
  .string()
  .trim()
  .refine(
    (val) => {
      if (!val) return false;
      const parts = val.split(',').map((p) => p.trim());
      if (parts.length === 0) return false;
      return parts.every((p) => (VALID_OPERATING_DAYS as readonly string[]).includes(p));
    },
    {
      message: 'Operating days must be a comma-separated list of: MON,TUE,WED,THU,FRI,SAT,SUN',
    }
  );

export const currencyAmountSchema = z.coerce
  .number({
    error: 'Currency amount must be a number',
  })
  .int('Currency amount must be an integer in smallest units (cents / paise)')
  .min(0, 'Currency amount cannot be negative')
  .max(100_000_000, 'Currency amount exceeds allowable maximum');

export const capacitySchema = z.coerce
  .number({
    error: 'Capacity must be an integer',
  })
  .int('Capacity must be an integer')
  .min(1, 'Capacity must be at least 1')
  .max(1000, 'Capacity cannot exceed 1000');

export const slotDurationMinutesSchema = z.coerce
  .number({
    error: 'Slot duration must be an integer',
  })
  .int('Slot duration must be an integer')
  .min(5, 'Slot duration must be at least 5 minutes')
  .max(1440, 'Slot duration cannot exceed 24 hours (1440 minutes)');

export const bufferMinutesSchema = z.coerce
  .number({
    error: 'Buffer minutes must be an integer',
  })
  .int('Buffer minutes must be an integer')
  .min(0, 'Buffer minutes cannot be negative')
  .max(240, 'Buffer minutes cannot exceed 4 hours (240 minutes)');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1).optional(),
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20).optional(),
  search: z.string().trim().max(100).optional(),
});

// Generic route parameter schemas
export const idParamSchema = {
  params: z.object({
    id: uuidSchema,
  }),
};

// ==========================================
// 2. Auth Route Schemas
// ==========================================

export const sendRegistrationOtpSchema = {
  body: z.object({
    email: emailSchema,
    businessName: z.string().trim().min(2, 'Business name must be at least 2 characters').max(100),
    slug: slugSchema,
  }),
};

export const registerTenantSchema = {
  body: z.object({
    businessName: z.string().trim().min(2, 'Business name must be at least 2 characters').max(100),
    slug: slugSchema,
    name: z.string().trim().min(2, 'Contact name must be at least 2 characters').max(100),
    email: emailSchema,
    password: passwordSchema,
    otp: z.string().trim().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must consist of digits only'),
    phone: z.string().trim().max(30).optional(),
  }),
};

export const universalLoginSchema = {
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
    tenantSlug: z.string().trim().optional(),
  }),
};

export const googleAuthSchema = {
  body: z
    .object({
      email: emailSchema.optional(),
      credential: z.string().trim().optional(),
      name: z.string().trim().max(100).optional(),
      businessName: z.string().trim().max(100).optional(),
      slug: slugSchema.optional(),
      tenantSlug: z.string().trim().optional(),
    })
    .refine((data) => Boolean(data.email || data.credential), {
      message: 'Either email or credential is required for Google authentication',
      path: ['email'],
    }),
};

export const forgotPasswordSchema = {
  body: z.object({
    email: emailSchema,
    tenantSlug: z.string().trim().optional(),
  }),
};

export const resetPasswordSchema = {
  body: z.object({
    email: emailSchema,
    otp: z.string().trim().min(4, 'Verification code is required').max(10),
    newPassword: passwordSchema,
  }),
};

export const staffInviteInfoQuerySchema = {
  query: z.object({
    token: z.string().trim().min(1, 'Invite token is required'),
  }),
};

export const staffSetPasswordSchema = {
  body: z.object({
    token: z.string().trim().min(1, 'Invite token is required'),
    password: passwordSchema,
    confirmPassword: z.string().optional(),
  }),
};

// ==========================================
// 3. Booking Route Schemas
// ==========================================

export const createBookingSchema = {
  body: z
    .object({
      resourceId: uuidSchema,
      customerName: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(100),
      customerEmail: emailSchema,
      customerPhone: z.string().trim().max(30).optional(),
      startTime: isoDateTimeSchema,
      endTime: isoDateTimeSchema,
      lockValue: z.string().trim().optional(),
      tenantId: uuidSchema.optional(),
      tenantSlug: z.string().trim().optional(),
    })
    .refine((data) => new Date(data.startTime) < new Date(data.endTime), {
      message: 'startTime must be chronologically before endTime',
      path: ['endTime'],
    }),
};

export const lockSlotSchema = {
  body: z.object({
    resourceId: uuidSchema,
    date: dateStringSchema,
    startTime: timeStringSchema,
    lockValue: z.string().trim().min(1, 'lockValue is required to acquire lock'),
  }),
};

export const lockSlotExtendSchema = {
  body: z.object({
    resourceId: uuidSchema,
    startTime: isoDateTimeSchema,
    lockValue: z.string().trim().min(1, 'lockValue is required to extend lock'),
    extendSeconds: z.coerce.number().int().min(10).max(600).optional(),
  }),
};

export const paymentIntentSchema = {
  params: z.object({
    id: uuidSchema,
  }),
  body: z
    .object({
      gateway: z.enum(['stripe', 'razorpay']).optional(),
      currency: z.string().trim().toLowerCase().min(3).max(3).default('inr').optional(),
    })
    .optional(),
};

export const createIntentAliasSchema = {
  body: z.object({
    bookingId: uuidSchema,
    gateway: z.enum(['stripe', 'razorpay']).optional(),
    currency: z.string().trim().toLowerCase().min(3).max(3).default('inr').optional(),
  }),
};

export const upiConfirmSchema = {
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    utr: z.string().trim().min(6, 'UTR / Reference must be at least 6 characters').max(50),
    amount: currencyAmountSchema.optional(),
  }),
};

export const razorpayVerifySchema = {
  body: z.object({
    razorpay_order_id: z.string().min(1, 'razorpay_order_id is required'),
    razorpay_payment_id: z.string().min(1, 'razorpay_payment_id is required'),
    razorpay_signature: z.string().min(1, 'razorpay_signature is required'),
    bookingId: uuidSchema,
  }),
};

// ==========================================
// 4. Admin Route Schemas
// ==========================================

export const createResourceSchema = {
  body: z
    .object({
      name: z.string().trim().min(2, 'Resource name must be at least 2 characters').max(100),
      description: z.string().trim().max(1000).optional(),
      hourlyRateCents: currencyAmountSchema,
      capacity: capacitySchema,
      bufferMinutes: bufferMinutesSchema.default(0),
      openTime: timeStringSchema,
      closeTime: timeStringSchema,
      slotDurationMinutes: slotDurationMinutesSchema,
      operatingDays: operatingDaysSchema,
    })
    .refine((data) => data.openTime < data.closeTime, {
      message: 'openTime must be before closeTime',
      path: ['closeTime'],
    }),
};

export const updateResourceSchema = {
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(1000).optional(),
    hourlyRateCents: currencyAmountSchema.optional(),
    capacity: capacitySchema.optional(),
    bufferMinutes: bufferMinutesSchema.optional(),
    openTime: timeStringSchema.optional(),
    closeTime: timeStringSchema.optional(),
    slotDurationMinutes: slotDurationMinutesSchema.optional(),
    operatingDays: operatingDaysSchema.optional(),
    isActive: z.boolean().optional(),
  }),
};

export const blockSlotSchema = {
  body: z
    .object({
      resourceId: uuidSchema,
      date: dateStringSchema,
      startTime: timeStringSchema,
      endTime: timeStringSchema,
      reason: z.string().trim().max(255).optional(),
    })
    .refine((data) => data.startTime < data.endTime, {
      message: 'startTime must be before endTime',
      path: ['endTime'],
    }),
};

export const adminBookingsQuerySchema = {
  query: z.object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1).optional(),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20).optional(),
    resourceId: uuidSchema.optional(),
    status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'PAID']).optional(),
    date: dateStringSchema.optional(),
  }),
};

export const adminWalkInSchema = {
  body: z
    .object({
      resourceId: uuidSchema,
      date: dateStringSchema,
      startTime: timeStringSchema,
      endTime: timeStringSchema,
      customerName: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(100),
      customerEmail: z
        .string()
        .trim()
        .toLowerCase()
        .max(255)
        .optional()
        .refine((val) => !val || z.string().email().safeParse(val).success, {
          message: 'Invalid customer email address',
        }),
      customerPhone: z.string().trim().max(30).optional(),
      amountPaidCents: currencyAmountSchema.optional(),
      paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'OTHER']).optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .refine((data) => data.startTime < data.endTime, {
      message: 'startTime must be before endTime',
      path: ['endTime'],
    }),
};

export const inviteStaffSchema = {
  body: z.object({
    email: emailSchema,
    role: z.enum(['STAFF', 'ADMIN'], {
      error: 'Role must be either STAFF or ADMIN',
    }),
  }),
};

export const markPaidSchema = {
  params: z.object({
    id: uuidSchema,
  }),
  body: z
    .object({
      paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'OTHER']).optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .optional(),
};
