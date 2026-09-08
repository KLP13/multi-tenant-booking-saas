import React from 'react';
import { Search, Filter, ArrowUpDown } from 'lucide-react';

export default function ResourceFilterToolbar({
  searchQuery,
  onSearchChange,
  capacityFilter,
  onCapacityChange,
  sortBy,
  onSortChange,
  totalCount = 0,
}) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xs)',
        padding: '16px 20px',
        marginBottom: '24px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      {/* Search Bar */}
      <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '220px' }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-secondary)',
          }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search spaces, rooms or equipment..."
          style={{
            width: '100%',
            padding: '10px 14px 10px 38px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            fontSize: '13px',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
        />
      </div>

      {/* Capacity Filter Pills */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Filter size={13} /> Capacity:
        </span>
        {[
          { label: 'All', value: 'ALL' },
          { label: '1-on-1', value: 'SOLO' },
          { label: 'Team (2-5)', value: 'TEAM' },
          { label: 'Group (6+)', value: 'LARGE' },
        ].map((item) => {
          const isActive = capacityFilter === item.value;
          return (
            <button
              key={item.value}
              onClick={() => onCapacityChange(item.value)}
              type="button"
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: isActive ? '600' : '400',
                borderRadius: '14px',
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                backgroundColor: isActive ? 'var(--accent)' : '#FAFAFA',
                color: isActive ? '#FFFFFF' : 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Sort By Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowUpDown size={13} /> Sort:
        </span>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          style={{
            padding: '7px 12px',
            borderRadius: 'var(--radius-xs)',
            border: '1px solid var(--border)',
            fontSize: '12px',
            backgroundColor: '#FFFFFF',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="NAME_ASC">Name (A - Z)</option>
          <option value="PRICE_LOW">Price: Low to High</option>
          <option value="PRICE_HIGH">Price: High to Low</option>
          <option value="CAPACITY_HIGH">Capacity: Highest</option>
        </select>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
          ({totalCount} {totalCount === 1 ? 'item' : 'items'})
        </span>
      </div>
    </div>
  );
}
