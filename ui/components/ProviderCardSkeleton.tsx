import React from 'react';

interface ProviderCardSkeletonProps {
  providerName?: string;
}

const ProviderCardSkeleton: React.FC<ProviderCardSkeletonProps> = ({ providerName }) => (
  <div 
    style={{
      height: '400px',
      display: 'flex',
      flexDirection: 'column',
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '16px',
    }}
  >
    {/* Header Skeleton */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
      <div style={{ width: '16px', height: '16px', borderRadius: '3px', background: '#334155' }} />
      <div style={{ width: '80px', height: '12px', background: '#334155', borderRadius: '4px' }} />
      <div style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
    </div>

    {/* Controls Skeleton */}
    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
      <div style={{ width: '70px', height: '28px', background: '#334155', borderRadius: '6px' }} />
    </div>

    {/* Content Lines Skeleton */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
      <div style={{ width: '95%', height: '10px', background: '#334155', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '88%', height: '10px', background: '#334155', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '92%', height: '10px', background: '#334155', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '78%', height: '10px', background: '#334155', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>

    {/* Footer Skeleton */}
    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
      <div style={{ width: '60px', height: '24px', background: '#334155', borderRadius: '6px' }} />
    </div>
  </div>
);

export default ProviderCardSkeleton;