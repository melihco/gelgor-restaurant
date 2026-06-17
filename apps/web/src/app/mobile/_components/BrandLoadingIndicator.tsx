'use client';

/**
 * Trailing laser scan bar — drone-show tail under the logo.
 */
export function BrandLoadingIndicator({
  size = 'md',
}: {
  size?: 'sm' | 'md' | 'lg';
}) {
  const barClass = `brand-laser-scan brand-laser-scan--${size}`;

  return (
    <div role="status" aria-label="Yükleniyor" className={barClass}>
      <div className="brand-laser-scan-track">
        <div className="brand-laser-scan-head" />
      </div>
    </div>
  );
}
