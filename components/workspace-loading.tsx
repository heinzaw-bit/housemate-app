export function WorkspaceLoading({
  kind = 'records',
}: {
  kind?: 'records' | 'home' | 'money' | 'assistant' | 'profile';
}) {
  return (
    <div
      className="content-inner workspace-skeleton"
      role="status"
      aria-label="Loading this section"
    >
      <span className="sr-only">Loading this section…</span>
      <div aria-hidden="true">
        <div className="skeleton-line skeleton-heading" />
        <div className="skeleton-line skeleton-subtitle" />
        {kind === 'assistant' ? (
          <div className="skeleton-card skeleton-composer" />
        ) : (
          <>
            {(kind === 'home' || kind === 'money') && (
              <div className="skeleton-grid">
                <div className="skeleton-card" />
                <div className="skeleton-card" />
              </div>
            )}
            <div className="skeleton-card">
              {[0, 1, 2].map((row) => (
                <div className="skeleton-row" key={row}>
                  <div className="skeleton-line" />
                  <div className="skeleton-line skeleton-subtitle" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
