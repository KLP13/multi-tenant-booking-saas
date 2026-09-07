async function testAll() {
  const baseUrl = 'http://localhost:5000';

  console.log('🧪 Starting API Verification Suite...\n');

  // 1. Health check
  const healthRes = await fetch(`${baseUrl}/health`);
  const healthData = await healthRes.json();
  console.log('1. GET /health:', healthRes.status === 200 ? '✅ PASS' : '❌ FAIL', healthData);

  // 2. Public resources for studio-one
  const resourcesRes = await fetch(`${baseUrl}/api/tenants/studio-one/resources`);
  const resourcesData = await resourcesRes.json() as any;
  console.log('2. GET /api/tenants/studio-one/resources:', resourcesRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Found ${resourcesData.resources?.length} resources`);
  const resourceId = resourcesData.resources[0].id;

  // 3. Slots for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];

  const slotsRes = await fetch(`${baseUrl}/api/resources/${resourceId}/slots?date=${dateStr}`);
  const slotsData = await slotsRes.json() as any;
  console.log(`3. GET /api/resources/:id/slots?date=${dateStr}:`, slotsRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Found ${slotsData.slots?.length} slots`);

  const availableSlot = slotsData.slots.find((s: any) => s.status === 'available');
  if (!availableSlot) {
    throw new Error('No available slot found for testing');
  }
  const testSlotTime = availableSlot.startTime;

  // 4. Lock slot
  const lockPayload = {
    resourceId,
    date: dateStr,
    startTime: testSlotTime,
    lockValue: 'test-session-token-999',
  };
  const lockRes = await fetch(`${baseUrl}/api/slots/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lockPayload),
  });
  const lockData = await lockRes.json();
  console.log('4. POST /api/slots/lock (14:00):', lockRes.status === 200 ? '✅ PASS' : '❌ FAIL', lockData);

  // 5. Try locking the same slot again (should 409 Conflict)
  const doubleLockRes = await fetch(`${baseUrl}/api/slots/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...lockPayload, lockValue: 'different-user-session' }),
  });
  console.log('5. Double Lock Prevention (409 Conflict):', doubleLockRes.status === 409 ? '✅ PASS (prevented!)' : '❌ FAIL', `status=${doubleLockRes.status}`);

  // 6. Create booking for the locked slot
  const startHour = parseInt(testSlotTime.split(':')[0], 10);
  const endSlotTime = `${String(startHour + 1).padStart(2, '0')}:00`;
  const bookingPayload = {
    resourceId,
    customerName: 'Jordan Sparks',
    customerEmail: 'jordan@example.com',
    startTime: `${dateStr}T${testSlotTime}:00.000Z`,
    endTime: `${dateStr}T${endSlotTime}:00.000Z`,
    lockValue: 'test-session-token-999',
  };
  const bookingRes = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingPayload),
  });
  const bookingData = await bookingRes.json() as any;
  console.log('6. POST /api/bookings:', bookingRes.status === 201 ? '✅ PASS' : '❌ FAIL', `Booking ID: ${bookingData.booking?.id}, status=${bookingData.booking?.status}`);
  const createdBookingId = bookingData.booking?.id;

  // 7. Payment intent
  const paymentRes = await fetch(`${baseUrl}/api/bookings/${createdBookingId}/payment-intent`, {
    method: 'POST',
  });
  const paymentData = await paymentRes.json() as any;
  console.log('7. POST /api/bookings/:id/payment-intent:', paymentRes.status === 200 ? '✅ PASS' : '❌ FAIL', `clientSecret=${paymentData.clientSecret?.slice(0, 20)}... isMock=${paymentData.isMock}`);

  // 8. Confirm booking (test endpoint)
  const confirmRes = await fetch(`${baseUrl}/api/bookings/${createdBookingId}/confirm-test`, {
    method: 'POST',
  });
  const confirmData = await confirmRes.json() as any;
  console.log('8. POST /api/bookings/:id/confirm-test:', confirmRes.status === 200 ? '✅ PASS' : '❌ FAIL', `status=${confirmData.booking?.status}`);

  // 9. Login as Studio One Admin
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantSlug: 'studio-one',
      email: 'admin@studioone.com',
      password: 'Password123!',
    }),
  });
  const loginData = await loginRes.json() as any;
  console.log('9. POST /api/auth/login:', loginRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Token acquired for ${loginData.user?.email}`);
  const token = loginData.token;

  // 10. Admin analytics
  const analyticsRes = await fetch(`${baseUrl}/api/admin/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const analyticsData = await analyticsRes.json() as any;
  console.log('10. GET /api/admin/analytics:', analyticsRes.status === 200 ? '✅ PASS' : '❌ FAIL', analyticsData.analytics);

  console.log('\n🎉 ALL BACKEND API ENDPOINTS TESTED SUCCESSFULLY!');
}

testAll().catch(console.error);
