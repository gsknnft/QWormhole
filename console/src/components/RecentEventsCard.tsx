const mockEvents = [
  { id: '1', type: 'qwormhole.session.started', label: 'QWormhole session established', ts: 'just now' },
  { id: '2', type: 'mesh.node.join', label: 'Node ROG-ALLY-X joined mesh', ts: '2m ago' },
  { id: '3', type: 'tunnel.established', label: 'SovereignTunnel ↔ cloud gateway', ts: '7m ago' },
];

export function RecentEventsCard() {
  return (
    <section className="card">
      <header className="card-header">
        <h2>Recent Field Events</h2>
      </header>
      <div className="card-body">
        <ul className="events-list">
          {mockEvents.map((e) => (
            <li key={e.id}>
              <div className="event-type">{e.type}</div>
              <div className="event-label">{e.label}</div>
              <div className="event-ts">{e.ts}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
