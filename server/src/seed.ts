import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma';

async function seed() {
  console.log('Starting database seed...');

  // 1. Create or update Tenant 1: Studio One
  const studioOne = await prisma.tenant.upsert({
    where: { slug: 'studio-one' },
    update: {},
    create: {
      name: 'Studio One',
      slug: 'studio-one',
      currency: 'USD',
    },
  });

  // 2. Create or update Tenant 2: Court House
  const courtHouse = await prisma.tenant.upsert({
    where: { slug: 'court-house' },
    update: {},
    create: {
      name: 'Court House Athletics',
      slug: 'court-house',
      currency: 'USD',
    },
  });

  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  // 3. Admin for Studio One
  const adminStudio = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: studioOne.id,
        email: 'admin@studioone.com',
      },
    },
    update: {},
    create: {
      tenantId: studioOne.id,
      email: 'admin@studioone.com',
      passwordHash: defaultPasswordHash,
      name: 'Alex Rivera',
      role: 'ADMIN',
    },
  });

  // 4. Staff for Studio One
  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: studioOne.id,
        email: 'staff@studioone.com',
      },
    },
    update: {},
    create: {
      tenantId: studioOne.id,
      email: 'staff@studioone.com',
      passwordHash: defaultPasswordHash,
      name: 'Jamie Tech',
      role: 'STAFF',
    },
  });

  // 5. Admin for Court House
  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: courtHouse.id,
        email: 'admin@courthouse.com',
      },
    },
    update: {},
    create: {
      tenantId: courtHouse.id,
      email: 'admin@courthouse.com',
      passwordHash: defaultPasswordHash,
      name: 'Sarah Connor',
      role: 'ADMIN',
    },
  });

  // 6. Super Admin
  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: studioOne.id,
        email: 'superadmin@platform.com',
      },
    },
    update: {},
    create: {
      tenantId: studioOne.id,
      email: 'superadmin@platform.com',
      passwordHash: defaultPasswordHash,
      name: 'Root Platform Admin',
      role: 'SUPER_ADMIN',
    },
  });

  // 7. Resources for Studio One
  const podcastSuite = await prisma.resource.upsert({
    where: {
      tenantId_name: {
        tenantId: studioOne.id,
        name: 'Podcast Recording Suite',
      },
    },
    update: {},
    create: {
      tenantId: studioOne.id,
      name: 'Podcast Recording Suite',
      description: 'Acoustically treated studio equipped with 4 Shure SM7B mics, Rodecaster Pro II, and 4K camera setup.',
      hourlyRateCents: 4500, // $45.00
      capacity: 4,
      bufferMinutes: 15,
      isActive: true,
    },
  });

  await prisma.resource.upsert({
    where: {
      tenantId_name: {
        tenantId: studioOne.id,
        name: 'Photography Studio A',
      },
    },
    update: {},
    create: {
      tenantId: studioOne.id,
      name: 'Photography Studio A',
      description: '1,200 sq ft cyclorama wall studio with Profoto strobe lighting and private dressing room.',
      hourlyRateCents: 7500, // $75.00
      capacity: 12,
      bufferMinutes: 30,
      isActive: true,
    },
  });

  await prisma.resource.upsert({
    where: {
      tenantId_name: {
        tenantId: studioOne.id,
        name: '4K Color & Editing Bay',
      },
    },
    update: {},
    create: {
      tenantId: studioOne.id,
      name: '4K Color & Editing Bay',
      description: 'DaVinci Resolve Mini Panel, calibrated Sony OLED grading monitor, and high-speed NVMe storage.',
      hourlyRateCents: 3500, // $35.00
      capacity: 2,
      bufferMinutes: 0,
      isActive: true,
    },
  });

  // 8. Resources for Court House
  await prisma.resource.upsert({
    where: {
      tenantId_name: {
        tenantId: courtHouse.id,
        name: 'Indoor Championship Tennis Court',
      },
    },
    update: {},
    create: {
      tenantId: courtHouse.id,
      name: 'Indoor Championship Tennis Court',
      description: 'US Open cushioned hard court with tournament-grade LED lighting and automated score tracking.',
      hourlyRateCents: 6000, // $60.00
      capacity: 4,
      bufferMinutes: 10,
      isActive: true,
    },
  });

  await prisma.resource.upsert({
    where: {
      tenantId_name: {
        tenantId: courtHouse.id,
        name: 'Glass Squash Court A',
      },
    },
    update: {},
    create: {
      tenantId: courtHouse.id,
      name: 'Glass Squash Court A',
      description: 'ASB glass back court with maple sprung timber flooring and viewing gallery.',
      hourlyRateCents: 3000, // $30.00
      capacity: 2,
      bufferMinutes: 10,
      isActive: true,
    },
  });

  // 9. Sample confirmed booking for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateStr = tomorrow.toISOString().split('T')[0];

  const bookingStart = new Date(`${tomorrowDateStr}T10:00:00.000Z`);
  const bookingEnd = new Date(`${tomorrowDateStr}T11:00:00.000Z`);

  const existingSample = await prisma.booking.findFirst({
    where: {
      resourceId: podcastSuite.id,
      startTime: bookingStart,
    },
  });

  if (!existingSample) {
    await prisma.booking.create({
      data: {
        tenantId: studioOne.id,
        resourceId: podcastSuite.id,
        customerName: 'Marcus Vance',
        customerEmail: 'marcus@audiopod.co',
        startTime: bookingStart,
        endTime: bookingEnd,
        status: 'CONFIRMED',
        totalAmountCents: 4500,
        stripePaymentIntentId: 'pi_sample_marcus_vance_001',
      },
    });
  }

  console.log('✅ Seed completed successfully!');
  console.log('───────────────────────────────────────────────');
  console.log('Sample Logins (Password for all: Password123!):');
  console.log('  Studio One Admin:    admin@studioone.com');
  console.log('  Studio One Staff:    staff@studioone.com');
  console.log('  Court House Admin:   admin@courthouse.com');
  console.log('  Super Admin:         superadmin@platform.com');
  console.log('Sample Slugs:');
  console.log('  /api/tenants/studio-one/resources');
  console.log('  /api/tenants/court-house/resources');
  console.log('───────────────────────────────────────────────');
}

seed()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
