# Multi-Tenant Resource Booking SaaS Platform

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green?logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-ES2022-blue?logo=typescript)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey?logo=express)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)
![Redis](https://img.shields.io/badge/Redis-Upstash-DC382D?logo=redis)
![Resend](https://img.shields.io/badge/Resend-Email_API-black?logo=resend)
![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?logo=stripe)

A production-grade, multi-tenant resource booking platform built with **Node.js, Express, TypeScript, Prisma ORM, Supabase PostgreSQL, Redis, Resend Email API, and React**.

This platform enables organizations (tenants) to manage bookable resources (meeting rooms, equipment, vehicles, sports courts, and services) with real-time conflict detection, guest and registered user bookings, role-based access control (RBAC), custom business branding, and automated transactional emails.

---

## Key Features

- **Multi-Tenant Architecture**: Complete tenant data isolation at the database level (`tenantId` foreign key scoping across all entity tables) with dedicated subpath routing (`/:slug`).
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for `ADMIN` (full operations, revenue metrics, analytics, team management, and business settings) and `STAFF` (front-desk operational view, bookings, and inventory only).
- **Resource and Booking Engine**:
  - Dynamic slot generation with capacity and custom operating schedules.
  - Slot locking and real-time conflict prevention.
  - Support for registered user bookings and guest checkout (`customerName`, `customerEmail`).
- **Transactional Email Service (Resend)**:
  - Powered by the **Resend API** with direct HTTP dispatch and automated fallbacks.
  - Automated HTML booking confirmations with reference IDs, calendar dates, and location details.
  - Real-time booking cancellation notifications and slot release confirmations.
  - 6-digit cryptographic OTP verification for self-serve business registration and password resets.
- **Payment and Checkout Ready**:
  - Integrated checkout drawer supporting INR (Rs.) and international currencies.
  - Stripe and Razorpay payment processing support with webhook signature verification.
- **Redis Caching and Distributed Locks**: High-speed caching for hot slot queries and concurrent booking locks (via Upstash Redis with in-memory local development fallback).
- **Supabase PostgreSQL and Prisma ORM**: Transaction-mode connection pooling (`DATABASE_URL`) with direct session-mode migrations (`DIRECT_URL`).

---

## Tech Stack

### Backend (`/server`)
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Language**: TypeScript (ES2022)
- **Database & ORM**: Supabase PostgreSQL with Prisma ORM v7
- **Caching & Locks**: Upstash Redis (`ioredis`)
- **Authentication**: JWT & `bcryptjs` + Google OAuth 2.0
- **Email Delivery**: Resend API (transactional notifications, OTP verification, and password resets)
- **Payment Processing**: Stripe & Razorpay SDKs

### Frontend (`/client`)
- **Framework**: React 19 / Vite
- **Styling**: Vanilla CSS (Warm Ivory Editorial Design System)
- **State Management**: React Context and Hooks
- **Icons & UI**: Lucide React and Sonner Toasts
- **Charts**: Recharts

---

## Repository Structure

```
multi-tenant-booking-saas/
├── client/                     # Frontend Application (React/Vite)
│   ├── src/
│   │   ├── api/                # Axios client with interceptors
│   │   ├── components/         # Modular UI components (booking, auth, layout)
│   │   ├── context/            # Tenant Context and state management
│   │   ├── pages/              # Customer booking, admin dashboard, login, and registration
│   │   └── utils/              # Date/time formatting and helpers
│   └── package.json
│
└── server/                     # Backend API (Node.js/Express/TypeScript)
    ├── prisma/
    │   └── schema.prisma       # Prisma ORM multi-tenant data schema
    ├── src/
    │   ├── lib/                # Prisma client, Redis client, Resend email service
    │   ├── middleware/         # Auth JWT, RBAC guards, and error handling
    │   ├── routes/             # Admin, Auth, Bookings, Public, and Webhook routes
    │   └── index.ts            # Express server entry point
    ├── .env.example            # Environment variables template
    ├── tsconfig.json           # TypeScript configuration
    └── package.json
```

---

## Quick Start Guide for Collaborators

### 1. Prerequisites
Ensure you have the following installed locally:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)
- A [Supabase](https://supabase.com/) PostgreSQL database
- Optional: An [Upstash Redis](https://upstash.com/) instance and a [Resend](https://resend.com/) API key

### 2. Clone the Repository
```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd multi-tenant-booking-saas
```

### 3. Server Setup (`/server`)

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install
```

#### Configure Environment Variables
Create a `.env` file in the `server/` directory based on `.env.example`:

```env
PORT=5000
NODE_ENV=development

# Supabase Transaction-Mode Pooler (Port 6543)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Supabase Direct Session-Mode Connection (Port 5432)
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"

# Upstash Redis (or leave blank for local in-memory fallback)
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."

# Security
JWT_SECRET="your-jwt-secret-key"

# Email Delivery (Resend API)
RESEND_API_KEY="re_..."
EMAIL_FROM="onboarding@resend.dev"

# Payments (optional for local development)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
RAZORPAY_KEY_ID="..."
RAZORPAY_KEY_SECRET="..."
```

> Note for Special Characters in Passwords: If your database password contains `@`, replace it with `%40` in the URL (e.g., `pass%40word`).

#### Database Migration and Prisma Generation
```bash
# Generate Prisma Client
npx prisma generate

# Sync schema with Supabase PostgreSQL
npx prisma db push
```

#### Start the Server
```bash
# Development mode with hot-reloading
npm run dev

# Production build and run
npm run build
npm start
```

---

### 4. Client Setup (`/client`)

```bash
# Navigate to client directory
cd ../client

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

---

## Database Schema and Prisma Commands

The relational multi-tenant models include `Tenant`, `User`, `Resource`, `Booking`, and `AuditLog`.

```bash
# Validate Prisma schema
npx prisma validate

# Open Prisma Studio to inspect live database records visually
npx prisma studio

# Create a database migration
npx prisma migrate dev --name init
```

---

## API Endpoints Overview

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | API service health check | Public |
| `POST` | `/api/auth/register-tenant` | Public self-serve business onboarding with OTP | Public |
| `POST` | `/api/auth/login` | Tenant-scoped email/password login | Public |
| `POST` | `/api/auth/universal-login` | Global business login across tenants | Public |
| `POST` | `/api/auth/google` | Google OAuth one-click authentication | Public |
| `POST` | `/api/auth/forgot-password` | Dispatch 6-digit password reset OTP via Resend | Public |
| `POST` | `/api/auth/reset-password` | Verify OTP and update password | Public |
| `GET` | `/api/auth/me` | Fetch authenticated user and tenant profile | Authenticated |
| `GET` | `/api/resources` | List bookable resources for tenant | Public |
| `GET` | `/api/slots` | Fetch real-time available time slots | Public |
| `POST` | `/api/slots/lock` | Acquire temporary hold on a slot | Public |
| `POST` | `/api/bookings` | Confirm reservation (guest or user) | Public |
| `GET` | `/api/admin/me` | Fetch business dashboard profile | Staff & Admin |
| `PUT` | `/api/admin/profile` | Update business settings, logo, and policies | Admin Only |
| `GET` | `/api/admin/bookings` | View tenant bookings list and filter | Staff & Admin |
| `GET` | `/api/admin/bookings/export`| Export bookings to CSV | Staff & Admin |
| `POST` | `/api/admin/slots/block` | Manual maintenance slot block | Staff & Admin |
| `GET` | `/api/admin/analytics` | Revenue and occupancy metrics | Admin Only |
| `GET` | `/api/admin/team` | List staff and administrators | Admin Only |
| `POST` | `/api/admin/team` | Invite new staff or admin member | Admin Only |

---

## Collaborator Workflow and Guidelines

1. **Pull Latest Changes**: Always run `git pull origin main` before creating a new branch.
2. **Branch Naming**:
   - Features: `feature/resource-filtering`
   - Bug Fixes: `fix/stripe-webhook-parsing`
   - Enhancements: `chore/redis-connection-retry`
3. **Pull Requests**: Submit PRs against the `main` branch with clear description of changes.
