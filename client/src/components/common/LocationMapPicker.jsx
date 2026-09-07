import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, MapPin, Navigation, ExternalLink, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

// Custom SVG Pin Icon for Leaflet
const customPinIcon = L.divIcon({
  className: 'custom-map-marker',
  html: `
    <div style="
      position: relative;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.35));
    ">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="#DC2626" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3" fill="#FFFFFF"></circle>
      </svg>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 34],
});

export default function LocationMapPicker({
  value = '',
  onChange,
  label = 'Physical Location / Address',
  placeholder = 'Search landmark, street, area or pin on map...',
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [showDropdown, setShowDropdown] = useState(false);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Default initial coordinates: Bangalore, India (or fallback)
  const defaultCoords = { lat: 12.9716, lng: 77.5946 };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const initialLat = coords?.lat || defaultCoords.lat;
    const initialLng = coords?.lng || defaultCoords.lng;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([initialLat, initialLng], {
      icon: customPinIcon,
      draggable: true,
    }).addTo(map);

    // When marker is dragged
    marker.on('dragend', async (e) => {
      const position = e.target.getLatLng();
      setCoords({ lat: position.lat, lng: position.lng });
      await reverseGeocode(position.lat, position.lng);
    });

    // When user clicks anywhere on map
    map.on('click', async (e) => {
      marker.setLatLng(e.latlng);
      setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      await reverseGeocode(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    // Fix map size after rendering
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Reverse geocode lat/lng into a readable address
  const reverseGeocode = async (lat, lng) => {
    try {
      setSearching(true);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      const data = await res.json();
      if (data && data.display_name) {
        // Format clean address
        const addr = data.display_name;
        onChange(addr);
        setSearchQuery(addr);
      }
    } catch (err) {
      console.error('Reverse geocode error:', err);
    } finally {
      setSearching(false);
    }
  };

  // Search places as user types
  const handleSearchChange = (e) => {
    const text = e.target.value;
    setSearchQuery(text);
    onChange(text);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!text || text.trim().length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&addressdetails=1&limit=5`
        );
        const results = await res.json();
        setSuggestions(results || []);
        setShowDropdown((results || []).length > 0);
      } catch (err) {
        console.error('Search place error:', err);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  // Select place suggestion
  const handleSelectPlace = (place) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    const formatted = place.display_name;

    onChange(formatted);
    setSearchQuery(formatted);
    setShowDropdown(false);
    setCoords({ lat, lng });

    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setView([lat, lng], 16);
      markerRef.current.setLatLng([lat, lng]);
    }
  };

  // Use browser geolocation (Find My Current Location)
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setGeolocating(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });

        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([lat, lng], 16);
          markerRef.current.setLatLng([lat, lng]);
        }

        await reverseGeocode(lat, lng);
        toast.success('Exact device GPS location detected and pinned!');
        setGeolocating(false);
      },
      (err) => {
        console.warn('Geolocation blocked or unavailable:', err);
        toast.error(
          'Location blocked by browser. Click the ⊘ icon in your address bar to allow location, or search your landmark above.'
        );
        setGeolocating(false);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  // Sync external value with local input
  useEffect(() => {
    if (value && value !== searchQuery) {
      setSearchQuery(value);
    }
  }, [value]);

  const googleMapsUrl = value
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`
    : coords
    ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
    : null;

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <label className="input-label" style={{ marginBottom: 0 }}>
          {label}
        </label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={geolocating}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#2563EB',
              fontSize: '12px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: 0,
            }}
          >
            {geolocating ? <Loader2 size={13} className="spin" /> : <Navigation size={13} />}
            Use My Current Location
          </button>

          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#15803D',
                fontSize: '12px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={13} />
              Open in Google Maps
            </a>
          )}
        </div>
      </div>

      {/* Autocomplete Search Input with Pin Icon */}
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <div style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#64748B',
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none',
        }}>
          {searching ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className="input-field"
          style={{
            paddingLeft: '38px',
            paddingRight: '36px',
          }}
        />

        {value && (
          <div style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#15803D',
            display: 'flex',
            alignItems: 'center',
          }}>
            <Check size={16} />
          </div>
        )}

        {/* Dropdown Suggestions */}
        {showDropdown && suggestions.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
            marginTop: '4px',
            maxHeight: '220px',
            overflowY: 'auto',
          }}>
            {suggestions.map((item, idx) => (
              <div
                key={idx}
                onClick={() => handleSelectPlace(item)}
                style={{
                  padding: '10px 14px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  borderBottom: idx < suggestions.length - 1 ? '1px solid #F1F5F9' : 'none',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
              >
                <MapPin size={15} color="#DC2626" style={{ marginTop: '2px', flexShrink: 0 }} />
                <span style={{ color: '#1E293B', lineHeight: '1.4' }}>{item.display_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Map */}
      <div style={{
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
      }}>
        <div
          ref={mapContainerRef}
          style={{
            height: '240px',
            width: '100%',
            zIndex: 1,
          }}
        />

        {/* Instructions banner overlay */}
        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          zIndex: 500,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          color: '#FFFFFF',
          padding: '4px 10px',
          borderRadius: '4px',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          pointerEvents: 'none',
          backdropFilter: 'blur(2px)',
        }}>
          <MapPin size={12} color="#F87171" />
          <span>Click or drag pin to set exact entrance</span>
        </div>
      </div>
    </div>
  );
}
