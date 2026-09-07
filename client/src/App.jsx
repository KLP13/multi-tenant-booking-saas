import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';

import { TenantProvider } from './context/TenantContext';
import LandingPage from './pages/LandingPage';
import RegisterTenantPage from './pages/RegisterTenantPage';
import TenantLoginPage from './pages/TenantLoginPage';
import TenantBookingPage from './pages/customer/TenantBookingPage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';

export default function App() {
  return (
    <BrowserRouter>
      {/* Toast notifications */}
      <Toaster position="bottom-right" richColors theme="light" />

      <Routes>
        {/* Platform Home */}
        <Route path="/" element={<LandingPage />} />

        {/* Business Self-Registration */}
        <Route path="/register" element={<RegisterTenantPage />} />

        {/* Platform Universal Sign-In */}
        <Route path="/login" element={<TenantLoginPage />} />

        {/* Tenant Admin Login */}
        <Route path="/:tenantSlug/admin/login" element={<AdminLoginPage />} />

        {/* Tenant Admin Dashboard */}
        <Route path="/:tenantSlug/admin" element={<AdminDashboardPage />} />

        {/* Tenant Public Customer Booking Experience */}
        <Route
          path="/:tenantSlug"
          element={
            <TenantProvider>
              <TenantBookingPage />
            </TenantProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
