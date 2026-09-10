import { authenticate } from '../middleware/auth';
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { storeOtp, verifyOtp } from '../lib/redis';
import { sendRegistrationOtp, sendWelcomeBusinessEmail, sendPasswordResetEmail } from '../lib/email';

const router = Router();

/**
 * POST /api/auth/send-registration-otp
 * Generates and sends a 6-digit OTP to verify manual tenant registration
 */
router.post('/send-registration-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, businessName, slug } = req.body;

    if (!email || !businessName || !slug) {
      throw createError(400, 'email, businessName, and slug are required');
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

    if (cleanSlug.length < 3) {
      throw createError(400, 'Slug must be at least 3 characters long');
    }

    // Check if slug is already taken before sending OTP
    const existing = await prisma.tenant.findUnique({
      where: { slug: cleanSlug },
    });

    if (existing) {
      throw createError(409, `The URL slug "${cleanSlug}" is already taken. Please choose another.`);
    }

    // Generate 6-digit code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis (expires in 10 minutes)
    await storeOtp(cleanEmail, otp, 600);

    // Send email (or log to terminal in dev mode)
    await sendRegistrationOtp(cleanEmail, otp, businessName);

    res.json({
      success: true,
      message: `A 6-digit verification code was sent to ${cleanEmail}`,
      devOtp: !process.env.SMTP_HOST ? otp : undefined,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/register-tenant
 * Public self-serve onboarding for new businesses with OTP verification
 * Body: { businessName, slug, currency, adminName, email, password, otp }
 * Returns: { token, tenant, user }
 */
router.post('/register-tenant', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { businessName, slug, currency = 'INR', adminName, email, password, otp } = req.body;

    if (!businessName || !slug || !email || !password) {
      throw createError(400, 'businessName, slug, email, and password are required');
    }

    if (!otp) {
      throw createError(400, 'Verification code (OTP) is required to verify your business email');
    }

    const cleanEmail = email.toLowerCase().trim();

    // Verify OTP
    const isOtpValid = await verifyOtp(cleanEmail, otp);
    if (!isOtpValid) {
      throw createError(400, 'Invalid or expired verification code. Please request a new code.');
    }

    // Clean & validate slug
    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (cleanSlug.length < 3) {
      throw createError(400, 'Slug must be at least 3 characters long');
    }

    // Check if slug already taken
    const existing = await prisma.tenant.findUnique({
      where: { slug: cleanSlug },
    });

    if (existing) {
      throw createError(409, `The URL slug "${cleanSlug}" is already taken. Please choose another.`);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create Tenant and Admin User together
    const tenant = await prisma.tenant.create({
      data: {
        name: businessName,
        slug: cleanSlug,
        currency: currency.toUpperCase(),
        users: {
          create: {
            email: cleanEmail,
            passwordHash,
            name: adminName || businessName + ' Owner',
            role: 'ADMIN',
          },
        },
      },
      include: {
        users: true,
      },
    });

    const user = tenant.users[0];

    // Issue JWT token immediately
    const token = jwt.sign(
      { userId: user.id, tenantId: tenant.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    // Automatically send welcome email with public booking link & admin dashboard link
    sendWelcomeBusinessEmail(cleanEmail, businessName, cleanSlug).catch((err) => {
      console.error('Failed to send welcome email:', err);
    });

    res.status(201).json({
      token,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        currency: tenant.currency,
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      emailedLinks: true,
    });
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/auth/login
 * Body: { email, password, tenantSlug }
 * Returns: { token, user: { id, name, email, role } }
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, tenantSlug } = req.body;

    if (!email || !password || !tenantSlug) {
      throw createError(400, 'email, password and tenantSlug are required');
    }

    // Find tenant by slug
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      throw createError(404, 'Tenant not found');
    }

    // Find user scoped to this tenant
    const user = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });

    if (!user) {
      throw createError(401, 'Invalid email or password');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw createError(401, 'Invalid email or password');
    }

    // Issue JWT
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenantId, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/universal-login
 * Signs in existing business owner/staff from the main platform login
 * Body: { email, password }
 * Returns: { token, tenant: { id, name, slug }, user: { id, name, email, role } }
 */
router.post('/universal-login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw createError(400, 'Email and password are required');
    }

    const cleanEmail = email.toLowerCase().trim();

    // Find all user records across tenants with this email
    const users = await prisma.user.findMany({
      where: { email: cleanEmail },
      include: { tenant: true },
    });

    if (users.length === 0) {
      throw createError(401, 'No business account found with this email address');
    }

    // Find user record whose password matches
    let matchedUser = null;
    for (const u of users) {
      const match = await bcrypt.compare(password, u.passwordHash);
      if (match) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      throw createError(401, 'Invalid email or password');
    }

    const token = jwt.sign(
      { userId: matchedUser.id, tenantId: matchedUser.tenantId, role: matchedUser.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      tenant: {
        id: matchedUser.tenant.id,
        name: matchedUser.tenant.name,
        slug: matchedUser.tenant.slug,
        currency: matchedUser.tenant.currency,
      },
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        email: matchedUser.email,
        role: matchedUser.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/google
 * Universal Google OAuth endpoint for both login and new tenant onboarding
 * Body: { email, name, businessName?, slug? }
 */
router.post('/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name, businessName, slug } = req.body;

    if (!email) {
      throw createError(400, 'Google email is required');
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. If businessName and slug are provided -> CREATE NEW BUSINESS!
    if (businessName && slug) {
      const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
      if (cleanSlug.length < 3) {
        throw createError(400, 'Slug must be at least 3 characters long');
      }

      const existingSlug = await prisma.tenant.findUnique({
        where: { slug: cleanSlug },
      });

      if (existingSlug) {
        throw createError(409, `The URL slug "${cleanSlug}" is already taken. Please choose another.`);
      }

      const randomSecret = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      const passwordHash = await bcrypt.hash(randomSecret, 10);

      const tenant = await prisma.tenant.create({
        data: {
          name: businessName,
          slug: cleanSlug,
          currency: 'INR',
          users: {
            create: {
              email: cleanEmail,
              passwordHash,
              name: name || businessName + ' Owner',
              role: 'ADMIN',
            },
          },
        },
        include: {
          users: true,
        },
      });

      const newUser = tenant.users[0];
      const token = jwt.sign(
        { userId: newUser.id, tenantId: tenant.id, role: newUser.role },
        process.env.JWT_SECRET as string,
        { expiresIn: '7d' }
      );

      sendWelcomeBusinessEmail(cleanEmail, businessName, cleanSlug).catch((err) => {
        console.error('Failed to send welcome email:', err);
      });

      return res.status(201).json({
        isNewUser: false,
        token,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          currency: tenant.currency,
        },
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
        },
        emailedLinks: true,
      });
    }

    // 2. Check if user already exists (whether on Login page or Register page)
    const existingUsers = await prisma.user.findMany({
      where: { email: cleanEmail },
      include: { tenant: true },
    });

    if (existingUsers.length > 0) {
      // Existing user found! Log them in directly to their existing business portal
      const user = existingUsers[0];
      const token = jwt.sign(
        { userId: user.id, tenantId: user.tenantId, role: user.role },
        process.env.JWT_SECRET as string,
        { expiresIn: '7d' }
      );

      return res.json({
        isNewUser: false,
        token,
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          slug: user.tenant.slug,
          currency: user.tenant.currency,
        },
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    // 3. User does not exist -> Prompt them to complete their business details
    return res.json({
      isNewUser: true,
      email: cleanEmail,
      name: name || '',
      message: 'Please provide business name and URL slug to complete setup',
    });
  } catch (err) {
    next(err);
  }
});


/**
 * POST /api/auth/forgot-password
 * Initiates password reset by sending a 6-digit verification code to the user's email
 */
router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, tenantSlug } = req.body;

    if (!email) {
      throw createError(400, 'Email address is required');
    }

    const cleanEmail = email.toLowerCase().trim();

    let user;
    if (tenantSlug) {
      const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
      if (tenant) {
        user = await prisma.user.findFirst({
          where: { email: cleanEmail, tenantId: tenant.id },
          include: { tenant: true },
        });
      }
    }

    if (!user) {
      user = await prisma.user.findFirst({
        where: { email: cleanEmail },
        include: { tenant: true },
      });
    }

    // Return positive confirmation to avoid leaking email enumeration
    if (!user) {
      return res.json({
        success: true,
        message: `If an account exists for ${cleanEmail}, a verification code has been sent.`,
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis / memory for 15 minutes (900 seconds)
    await storeOtp(`reset:${cleanEmail}`, otp, 900);

    // Send reset email via Resend
    await sendPasswordResetEmail(cleanEmail, otp, user.tenant?.name || 'Bespoke Bookings');

    return res.json({
      success: true,
      message: `A 6-digit password reset code was sent to ${cleanEmail}`,
      devOtp: !process.env.SMTP_HOST && !process.env.RESEND_API_KEY ? otp : undefined,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/reset-password
 * Verifies the 6-digit code and updates the user's password
 */
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      throw createError(400, 'Email, verification code, and new password are required');
    }

    if (newPassword.length < 6) {
      throw createError(400, 'New password must be at least 6 characters long');
    }

    const cleanEmail = email.toLowerCase().trim();

    const isValid = await verifyOtp(`reset:${cleanEmail}`, otp);
    if (!isValid) {
      throw createError(400, 'Invalid or expired verification code');
    }

    const users = await prisma.user.findMany({
      where: { email: cleanEmail },
      include: { tenant: true },
    });

    if (users.length === 0) {
      throw createError(404, 'User account not found');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.updateMany({
      where: { email: cleanEmail },
      data: { passwordHash: hashedPassword },
    });

    return res.json({
      success: true,
      message: 'Password has been successfully updated. You can now log in.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Returns current authenticated user and tenant info
 */
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            currency: true,
            address: true,
            phone: true,
            logoUrl: true,
            cancellationPolicy: true,
          },
        },
      },
    });

    if (!user) {
      throw createError(404, 'User not found or session invalid');
    }

    res.json({ user, tenant: user.tenant });
  } catch (err) {
    next(err);
  }
});


export default router;
