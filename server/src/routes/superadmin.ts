import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

const router = Router();

router.use(authenticate);
router.use(requireRole('SUPER_ADMIN', 'ADMIN'));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/superadmin/metrics
// Platform-wide health and aggregate analytics
// ─────────────────────────────────────────────────────────────────────────────
router.get('/metrics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      totalTenants,
      totalBookings,
      confirmedBookings,
      totalResources,
      totalUsers,
      revenueAgg,
      recentTenants,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'CONFIRMED' } }),
      prisma.resource.count(),
      prisma.user.count(),
      prisma.booking.aggregate({
        where: { status: 'CONFIRMED' },
        _sum: { totalAmountCents: true },
      }),
      prisma.tenant.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              resources: true,
              bookings: true,
              users: true,
            },
          },
        },
      }),
    ]);

    const totalGmvCents = revenueAgg._sum.totalAmountCents || 0;

    res.json({
      success: true,
      metrics: {
        totalTenants,
        totalBookings,
        confirmedBookings,
        totalResources,
        totalUsers,
        totalGmvCents,
        recentTenants,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/superadmin/tenants
// List all tenants with statistics
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tenants', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        _count: {
          select: {
            resources: true,
            bookings: true,
            users: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ tenants });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/superadmin/tenants
// Create a new tenant with initial Admin user
// ─────────────────────────────────────────────────────────────────────────────
router.post('/tenants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, currency = 'INR', adminEmail, adminPassword, adminName } = req.body;

    if (!name || !slug || !adminEmail || !adminPassword) {
      throw createError(400, 'name, slug, adminEmail, and adminPassword are required');
    }

    const existingTenant = await prisma.tenant.findUnique({
      where: { slug },
    });

    if (existingTenant) {
      throw createError(409, 'A tenant with this slug already exists');
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        currency,
        users: {
          create: {
            email: adminEmail.toLowerCase().trim(),
            passwordHash,
            name: adminName || 'Admin',
            role: 'ADMIN',
          },
        },
      },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    res.status(201).json({ tenant });
  } catch (err) {
    next(err);
  }
});

export default router;
