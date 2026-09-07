# 🏢 Multi-Tenant Resource Booking SaaS Platform

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green?logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-ES2022-blue?logo=typescript)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey?logo=express)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)
![Redis](https://img.shields.io/badge/Redis-Caching-DC382D?logo=redis)
![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?logo=stripe)
![License](https://img.shields.io/badge/License-MIT-yellow)

A production-grade, multi-tenant resource booking platform built with **Node.js, Express, TypeScript, Prisma ORM, Supabase PostgreSQL, Redis, and Stripe**.

This platform enables organizations (tenants) to manage bookable resources (meeting rooms, equipment, desks, services) with real-time conflict detection, guest and registered user bookings, role-based access control (RBAC), and automated Stripe checkout flows.

---

## 🌟 Key Features

- 🏢 **Multi-Tenant Architecture**: Complete tenant data isolation at the database level (`tenantId` foreign key scoping across all entity tables).
- 🔐 **Role-Based Access Control (RBAC)**: Fine-grained permissions for `SUPER_ADMIN`, `ADMIN`, `STAFF`, and `USER`.
- 📅 **Resource & Booking Engine**:
  - Real-time time-slot conflict detection and availability validation.
  - Custom hourly pricing and capacity management per resource.
  - Support for registered user bookings and guest checkout (`customerName`, `customerEmail`).
- 💳 **Stripe Payment Integration**:
  - Automated Stripe PaymentIntents and Webhook integration for real-time payment confirmation.
- ⚡ **Redis Caching & Performance**: High-speed caching for hot resource queries and concurrent booking locks.
- 🗄️ **Supabase PostgreSQL & Prisma ORM**: Transaction-mode connection pooling (`DATABASE_URL`) with direct session-mode migrations (`DIRECT_URL`).

---

## 🛠️ Tech Stack

### **Backend (`/server`)**
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Language**: TypeScript (ES2022)
- **Database & ORM**: Supabase PostgreSQL & Prisma ORM v6
- **Caching**: Redis (`ioredis`)
- **Authentication**: JWT & `bcryptjs`
- **Payment Processing**: Stripe SDK

### **Frontend (`/client`)**
- **Framework**: React.js / Vite
- **Styling**: Vanilla CSS / Modern UI
- **State Management**: React Context & Hooks

---

## 📁 Repository Structure

```
multi-tenant-booking-saas/
├── client/                     # Frontend Application (React/Vite)
│   ├── src/
│   │   ├── components/         # Reusable UI components (ResourceCard, BookingModal, etc.)
│   │   ├── routes/             # App routes and page views
│   │   └── services/           # API client services
│   └── package.json
│
└── server/                     # Backend API (Node.js/Express/TypeScript)
    ├── prisma/
    │   └── schema.prisma       # Prisma ORM multi-tenant data schema
    ├── src/
    │   ├── config/             # Config, Prisma, Redis, & Stripe initializers
    │   ├── controllers/        # Express request controllers
    │   ├── middleware/         # Auth, Tenant isolation, & Error handling
    │   ├── routes/             # Express API routes (public, superadmin, etc.)
    │   ├── services/           # Core domain business logic
    │   ├── utils/              # Helper functions & logger
    │   └── index.ts            # Express app entry point
    ├── .env.example            # Environment variables template
    ├── tsconfig.json           # TypeScript configuration
    └── package.json
```

---

## 🚀 Quick Start Guide for Collaborators

### 1. Prerequisites
Ensure you have the following installed locally:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)
- [Redis](https://redis.io/) (or a running local Redis Docker instance)
- A [Supabase](https://supabase.com/) PostgreSQL database

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

# Redis
REDIS_URL="redis://localhost:6379"

# Security
JWT_SECRET="your-jwt-secret-key"
JWT_EXPIRES_IN="1d"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

> 💡 **Note for Special Characters in Passwords**: If your database password contains `@`, replace it with `%40` in the URL (e.g. `pass%40word`).

#### Database Migration & Prisma Generation
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

# Production build & run
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

## 🗄️ Database Schema & Prisma Commands

The relational multi-tenant models include `Tenant`, `User`, `Resource`, and `Booking`.

```bash
# Validate Prisma schema
npx prisma validate

# Open Prisma Studio to inspect live database records visually
npx prisma studio

# Create a database migration
npx prisma migrate dev --name init
```

---

## 📡 API Endpoints Overview

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | API service health check | Public |
| `POST` | `/api/v1/auth/register` | Register new user under tenant | Public |
| `POST` | `/api/v1/auth/login` | Authenticate user & get JWT token | Public |
| `GET` | `/api/v1/resources` | List tenant resources | Tenant Authenticated |
| `POST` | `/api/v1/bookings` | Create new reservation | User / Guest |
| `POST` | `/api/v1/payments/create-intent`| Create Stripe PaymentIntent | Authenticated / Guest |
| `POST` | `/api/v1/payments/webhook` | Stripe payment confirmation webhook | Stripe |
| `GET` | `/api/v1/superadmin/tenants` | Manage platform tenants | Super Admin |

---

## 🤝 Collaborator Workflow & Guidelines

1. **Pull Latest Changes**: Always run `git pull origin main` before creating a new branch.
2. **Branch Naming**:
   - Features: `feature/resource-filtering`
   - Bug Fixes: `fix/stripe-webhook-parsing`
   - Enhancements: `chore/redis-connection-retry`
3. **Pull Requests**: Submit PRs against the `main` branch with clear description of changes.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
