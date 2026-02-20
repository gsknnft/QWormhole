export function MeshStatusCard() {
  // later: fetch from your gateway / registry
  const stats = {
    nodesOnline: 4,
    tunnelsActive: 7,
    qwormholeSessions: 1,
    lastUpdate: new Date().toLocaleTimeString(),
  };

  return (
    <section className="card">
      <header className="card-header">
        <h2>Mesh Status</h2>
        <span className="pill pill-green">healthy</span>
      </header>
      <div className="card-body">
        <div className="card-grid">
          <Stat label="Nodes online" value={String(stats.nodesOnline)} />
          <Stat label="Active tunnels" value={String(stats.tunnelsActive)} />
          <Stat label="QWormhole sessions" value={String(stats.qwormholeSessions)} />
        </div>
        <small style={{ color: 'var(--text-muted)' }}>Last update: {stats.lastUpdate}</small>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
