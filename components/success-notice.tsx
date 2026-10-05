import { CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
export function SuccessNotice({
  children,
  className = 'form-message success',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p role="status" className={`${className} motion-success`}>
      <span className="motion-success-icon" aria-hidden="true">
        <CircleCheck size={18} />
      </span>
      <span>{children}</span>
    </p>
  );
}
