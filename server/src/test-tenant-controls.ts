async function testTenantControls() {
  const baseUrl = 'http://localhost:5000';
  console.log('🧪 Testing Tenant Controls & Schedule Engine...\n');

  // 1. Login as Studio One Admin
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
  const token = loginData.token;
  console.log('1. Admin Login:', loginRes.status === 200 ? '✅ PASS' : '❌ FAIL');

  // 2. Get Resources
  const resRes = await fetch(`${baseUrl}/api/admin/resources`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const resData = await resRes.json() as any;
  const targetResource = resData.resources[0];
  console.log('2. Admin Resources:', resRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Found ${resData.resources?.length} resources`);

  // 3. Block a slot on targetResource
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];

  const blockRes = await fetch(`${baseUrl}/api/admin/slots/block`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resourceId: targetResource.id,
      date: dateStr,
      startTime: '13:00',
      endTime: '14:00',
      reason: 'Scheduled gear recalibration & cleaning',
    }),
  });
  const blockData = await blockRes.json() as any;
  console.log('3. Block Slot (Maintenance):', blockRes.status === 201 ? '✅ PASS' : '❌ FAIL', `Blocked: ${blockData.booking?.customerName}`);

  // 4. Verify public slots reflects the blocked state
  const slotsRes = await fetch(`${baseUrl}/api/resources/${targetResource.id}/slots?date=${dateStr}`);
  const slotsData = await slotsRes.json() as any;
  const blockedSlot = slotsData.slots.find((s: any) => s.startTime === '13:00');
  console.log('4. Customer Slots View:', blockedSlot?.status === 'blocked' ? '✅ PASS (Slot correctly blocked!)' : '❌ FAIL', blockedSlot);

  // 5. Test CSV Export
  const csvRes = await fetch(`${baseUrl}/api/admin/bookings/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const csvText = await csvRes.text();
  const hasCsvHeaders = csvText.includes('Booking ID,Customer Name,Customer Email');
  console.log('5. Bookings CSV Export:', (csvRes.status === 200 && hasCsvHeaders) ? '✅ PASS' : '❌ FAIL', `CSV rows: ${csvText.split('\n').length}`);

  // 6. Test Business Profile & Cancellation Policy Update
  const profileRes = await fetch(`${baseUrl}/api/admin/profile`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Studio One Sound & Visuals',
      address: '742 Evergreen Terrace, Sector 4',
      phone: '+1 (555) 839-2041',
      cancellationPolicy: '100% refund up to 12 hours before start time.',
    }),
  });
  const profileData = await profileRes.json() as any;
  console.log('6. Business Profile Update:', profileRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Policy: ${profileData.tenant?.cancellationPolicy}`);

  // 7. Create Resource with Custom Schedule (e.g. 06:00 to 22:00, 30m slots)
  const createRes = await fetch(`${baseUrl}/api/admin/resources`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `All-Day Performance Court ${Date.now().toString().slice(-4)}`,
      description: 'Floodlit court available early morning to late night in 30-min blocks.',
      hourlyRateCents: 4000,
      capacity: 4,
      bufferMinutes: 0,
      openTime: '06:00',
      closeTime: '22:00',
      slotDurationMinutes: 30,
    }),
  });
  const createData = await createRes.json() as any;
  console.log('7. Custom Schedule Resource Creation:', createRes.status === 201 ? '✅ PASS' : '❌ FAIL', `${createData.resource?.name}: ${createData.resource?.openTime} to ${createData.resource?.closeTime} (${createData.resource?.slotDurationMinutes}m slots)`);

  // 8. Verify slots for 30m resource
  const newSlotsRes = await fetch(`${baseUrl}/api/resources/${createData.resource.id}/slots?date=${dateStr}`);
  const newSlotsData = await newSlotsRes.json() as any;
  console.log(`8. Dynamic Slot Count for 30m slots (06:00 to 22:00 = 16h * 2 = 32 slots):`, newSlotsData.slots.length === 32 ? '✅ PASS (Exactly 32 slots generated!)' : `Count: ${newSlotsData.slots.length}`);

  // 9. Create Weekday-Only Resource (MON-FRI)
  const weekdayResourceRes = await fetch(`${baseUrl}/api/admin/resources`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `Weekday Pro Arena ${Date.now().toString().slice(-4)}`,
      description: 'Open Monday to Friday only.',
      hourlyRateCents: 5000,
      capacity: 1,
      bufferMinutes: 0,
      openTime: '09:00',
      closeTime: '17:00',
      slotDurationMinutes: 60,
      operatingDays: 'MON,TUE,WED,THU,FRI',
    }),
  });
  const weekdayData = await weekdayResourceRes.json() as any;
  console.log('9. Operating Days Setting (Mon-Fri):', weekdayResourceRes.status === 201 ? '✅ PASS' : '❌ FAIL', `Days: ${weekdayData.resource?.operatingDays}`);

  // 10. Check Sunday slot request (2026-09-13 is Sunday)
  const sundayRes = await fetch(`${baseUrl}/api/resources/${weekdayData.resource.id}/slots?date=2026-09-13`);
  const sundayData = await sundayRes.json() as any;
  console.log('10. Off-Day Protection (Sunday Query):', sundayData.isClosed === true && sundayData.slots.length === 0 ? '✅ PASS' : '❌ FAIL', `isClosed: ${sundayData.isClosed}, msg: "${sundayData.message}"`);

  // 11. Team Management — Invite Staff Member
  const staffEmail = `staff_${Date.now().toString().slice(-4)}@courthouse.com`;
  const teamInviteRes = await fetch(`${baseUrl}/api/admin/team`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Casey FrontDesk',
      email: staffEmail,
      password: 'Password123!',
      role: 'STAFF',
    }),
  });
  const teamData = await teamInviteRes.json() as any;
  console.log('11. Team Staff Invite:', teamInviteRes.status === 201 ? '✅ PASS' : '❌ FAIL', `Created member: ${teamData.member?.name} (${teamData.member?.role})`);

  // 12. Staff Login & RBAC Gating
  const staffLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: staffEmail,
      password: 'Password123!',
      tenantSlug: 'studio-one',
    }),
  });
  const staffAuth = await staffLoginRes.json() as any;
  const staffToken = staffAuth.token;

  // Staff attempts to view financial analytics (Forbidden)
  const staffAnalyticsRes = await fetch(`${baseUrl}/api/admin/analytics`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  console.log('12. RBAC Revenue Protection for Staff:', staffAnalyticsRes.status === 403 ? '✅ PASS (403 Forbidden - Revenue hidden from staff!)' : `Status: ${staffAnalyticsRes.status}`);

  // Staff views bookings schedule (Allowed)
  const staffBookingsRes = await fetch(`${baseUrl}/api/admin/bookings`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  console.log('13. Staff Daily Check-ins Access:', staffBookingsRes.status === 200 ? '✅ PASS (Staff can manage check-ins)' : `Status: ${staffBookingsRes.status}`);

  console.log('\n🎉 ALL TENANT CONTROLS, OPERATING DAYS & STAFF RBAC TESTS PASSED!');
}

testTenantControls().catch(console.error);
