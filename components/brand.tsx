import { House } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-icon">
        <House size={22} strokeWidth={2.5} aria-hidden="true" />
      </span>
      {!compact && (
        <span className="brand-name">
          housemate<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
