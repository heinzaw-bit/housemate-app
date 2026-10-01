import { HouseMateMascot } from './housemate-mascot';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-icon">
        <HouseMateMascot />
      </span>
      {!compact && (
        <span className="brand-name">
          housemate<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
