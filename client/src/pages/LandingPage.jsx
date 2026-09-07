import React from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  ShieldCheck,
  CreditCard,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Bike,
  Building,
  Camera,
  Trophy,
  Layers,
  ChevronRight
} from 'lucide-react';

export default function LandingPage() {
  const businessTypes = [
    {
      icon: <Bike size={22} color="var(--accent)" />,
      title: 'Equipment & Rentals',
      example: 'E-bikes, kayaks, surfboards, camera kits, heavy tools',
      desc: 'Set hourly or daily rental slots with automatic buffer times for maintenance and gear check-in.',
    },
    {
      icon: <Camera size={22} color="var(--accent)" />,
      title: 'Creative Studios',
      example: 'Photography cyc walls, podcast booths, recording rooms',
      desc: 'Let creators book hourly sessions with seamless online payment and instant confirmation.',
    },
    {
      icon: <Trophy size={22} color="var(--accent)" />,
      title: 'Sports & Courts',
      example: 'Tennis courts, turf fields, squash courts, batting cages',
      desc: 'Eliminate scheduling disputes with synchronized court availability and automated access holds.',
    },
    {
      icon: <Building size={22} color="var(--accent)" />,
      title: 'Venues & Workspaces',
      example: 'Conference rooms, private dining halls, rehearsal lofts',
      desc: 'Manage capacity, hourly fees, and setup windows across multiple private venues from one dashboard.',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)' }}>
      {/* Navbar */}
      <header className="editorial-header">
        <div className="container editorial-header-inner">
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              backgroundColor: 'var(--accent)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-serif)',
              fontWeight: '700',
              fontSize: '18px',
            }}>
              B
            </div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: '600' }}>
              Bespoke Bookings
            </span>
          </Link>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <a href="#features" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Features
            </a>
            <a href="#businesses" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Who It's For
            </a>
            <a href="#how-it-works" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              How It Works
            </a>
            <Link to="/login" className="btn btn-outline" style={{ fontSize: '13px', padding: '8px 16px' }}>
              Sign In
            </Link>
            <Link to="/register" className="btn btn-primary" style={{ fontSize: '13px', padding: '8px 16px' }}>
              Register Your Business &rarr;
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        padding: '96px 0 72px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-alt)',
        textAlign: 'center',
      }}>
        <div className="container" style={{ maxWidth: '840px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: '500',
            color: 'var(--text-secondary)',
            marginBottom: '24px',
          }}>
            <Sparkles size={14} color="var(--accent)" />
            The unified booking engine for spaces, equipment & rentals
          </div>

          <h1 style={{
            fontSize: '56px',
            lineHeight: '1.12',
            letterSpacing: '-0.025em',
            marginBottom: '24px',
          }}>
            Rent any resource by the hour. <br />
            <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>Zero double-bookings.</span>
          </h1>

          <p style={{
            fontSize: '19px',
            lineHeight: '1.6',
            color: 'var(--text-secondary)',
            maxWidth: '680px',
            margin: '0 auto 36px',
          }}>
            From bike fleets and tennis courts to podcast rooms and event spaces — give your customers an effortless online booking experience with real-time slot holds and instant payments.
          </p>


          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '32px',
            flexWrap: 'wrap',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="var(--success)" /> Live Slot Lock (No Overlaps)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="var(--success)" /> Automated Online Payments
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="var(--success)" /> Your Custom URL in 60s
            </span>
          </div>
        </div>
      </section>

      {/* Feature Value Pillars */}
      <section id="features" style={{ padding: '80px 0', borderBottom: '1px solid var(--border)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 56px' }}>
            <h2 style={{ fontSize: '32px', marginBottom: '12px' }}>
              Everything your business needs to take bookings on autopilot
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Replace chaotic phone calls and manual spreadsheets with an intelligent booking system designed for rental operations.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '28px',
          }}>
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              padding: '32px',
              borderRadius: 'var(--radius-xs)',
            }}>
              <div style={{
                width: '42px',
                height: '42px',
                backgroundColor: 'var(--accent-light)',
                color: 'var(--accent)',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}>
                <ShieldCheck size={22} />
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '10px' }}>Guaranteed Zero Overlaps</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                When a customer selects a time slot, it is immediately placed on a temporary hold while they check out. No two customers can ever reserve the same slot at once.
              </p>
            </div>

            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              padding: '32px',
              borderRadius: 'var(--radius-xs)',
            }}>
              <div style={{
                width: '42px',
                height: '42px',
                backgroundColor: 'var(--accent-light)',
                color: 'var(--accent)',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}>
                <CreditCard size={22} />
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '10px' }}>Instant Online Payments</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Collect customer payments directly at the time of reservation. Bookings are confirmed automatically the millisecond payment succeeds.
              </p>
            </div>

            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border)',
              padding: '32px',
              borderRadius: 'var(--radius-xs)',
            }}>
              <div style={{
                width: '42px',
                height: '42px',
                backgroundColor: 'var(--accent-light)',
                color: 'var(--accent)',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}>
                <Clock size={22} />
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '10px' }}>Custom Buffer Times</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Need 15 minutes to clean a room or inspect equipment between customers? Built-in buffer controls ensure you always have prep time between reservations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Versatile Business Types */}
      <section id="businesses" style={{ padding: '80px 0', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-alt)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 56px' }}>
            <h2 style={{ fontSize: '32px', marginBottom: '12px' }}>
              Built for every type of rentable resource
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Whether you rent by the hour or by session, our platform adapts to your inventory.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '24px',
          }}>
            {businessTypes.map((b, i) => (
              <div key={i} style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border)',
                padding: '28px',
                borderRadius: 'var(--radius-xs)',
              }}>
                <div style={{ marginBottom: '16px' }}>{b.icon}</div>
                <h4 style={{ fontSize: '18px', marginBottom: '6px' }}>{b.title}</h4>
                <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: '600', marginBottom: '12px' }}>
                  {b.example}
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  {b.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" style={{ padding: '88px 0', borderBottom: '1px solid var(--border)', backgroundColor: '#FFFFFF' }}>
        <div className="container">
          <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 56px' }}>
            <h2 style={{ fontSize: '32px', marginBottom: '12px' }}>
              Launch your booking portal in 3 simple steps
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              No complex setup or technical expertise required. Go from signup to live bookings in under 5 minutes.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '32px',
          }}>
            <div style={{
              padding: '32px',
              backgroundColor: 'var(--bg-alt)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border)',
            }}>
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '32px',
                fontWeight: '700',
                color: 'var(--accent)',
                marginBottom: '16px',
              }}>
                01
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Create Your Business Portal</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Sign up in 60 seconds and claim your unique, branded booking URL. Add your logo, contact info, and cancellation policy.
              </p>
            </div>

            <div style={{
              padding: '32px',
              backgroundColor: 'var(--bg-alt)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border)',
            }}>
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '32px',
                fontWeight: '700',
                color: 'var(--accent)',
                marginBottom: '16px',
              }}>
                02
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Set Operating Schedules</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Add your courts, gear, or creative spaces. Customize operating hours, slot durations (30m to 4h), buffer windows, and active days.
              </p>
            </div>

            <div style={{
              padding: '32px',
              backgroundColor: 'var(--bg-alt)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border)',
            }}>
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '32px',
                fontWeight: '700',
                color: 'var(--accent)',
                marginBottom: '16px',
              }}>
                03
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Share & Accept Bookings</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Customers reserve real-time slots with zero double-booking risk, receive instant calendar invites, and revenue hits your account.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action Banner */}
      <section style={{
        padding: '72px 0',
        backgroundColor: '#1E1B18',
        color: '#FFFFFF',
        textAlign: 'center',
      }}>
        <div className="container" style={{ maxWidth: '640px' }}>
          <h2 style={{ fontSize: '36px', color: '#FFFFFF', marginBottom: '16px' }}>
            Ready to accept bookings online?
          </h2>
          <p style={{ fontSize: '16px', color: '#C5BEB5', lineHeight: '1.6', marginBottom: '32px' }}>
            Get your own branded booking portal up and running in under two minutes. No credit card required to get started.
          </p>
          <Link to="/register" className="btn btn-primary" style={{ padding: '14px 32px', fontSize: '16px' }}>
            Register Your Business Now &rarr;
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '36px 0',
        backgroundColor: 'var(--bg)',
        borderTop: '1px solid var(--border)',
        fontSize: '13px',
        color: 'var(--text-secondary)',
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>© {new Date().getFullYear()} Bespoke Bookings SaaS. All rights reserved.</div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <Link to="/login">Sign In</Link>
            <Link to="/register">Register Business</Link>
            <a href="#features">Features</a>
            <a href="#businesses">Who It's For</a>
            <a href="#how-it-works">How It Works</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
