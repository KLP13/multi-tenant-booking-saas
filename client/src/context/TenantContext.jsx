import React, { createContext, useContext, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const { tenantSlug } = useParams();
  const [tenant, setTenant] = useState(null);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTenantData = async () => {
    if (!tenantSlug) return;
    try {
      setLoading(true);
      const res = await api.get(`/tenants/${tenantSlug}/resources`);
      setTenant(res.data.tenant);
      setResources(res.data.resources);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tenant studio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenantData();
  }, [tenantSlug]);

  return (
    <TenantContext.Provider
      value={{
        tenantSlug,
        tenant,
        resources,
        loading,
        error,
        refreshTenantData: fetchTenantData,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
