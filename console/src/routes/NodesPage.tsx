import { useEffect, useState } from 'react';

type NodeInfo = {
  id: string;
  name: string;
  deviceType: string;
  status: 'online' | 'offline' | 'degraded';
  lastSeen: string;
};
/* 
const res = await fetch('http://your-gateway:3000/api/devices');
const json = await res.json();

*/
export function NodesPage() {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: wire into @coreflame/signal-fabric API
    async function fetchNodes() {
      try {
        // placeholder
        const data: NodeInfo[] = [
          {
            id: 'pi-fpga-01',
            name: 'Pi-FPGA-01',
            deviceType: 'soc_node',
            status: 'online',
            lastSeen: 'just now',
          },
          {
            id: 'rog-ally-x',
            name: 'ROG Ally X',
            deviceType: 'rog_ally',
            status: 'online',
            lastSeen: '1m ago',
          },
          {
            id: 'flipper-zero-01',
            name: 'Flipper Zero',
            deviceType: 'flipper_proxy',
            status: 'degraded',
            lastSeen: '3m ago',
          },
        ];
        setNodes(data);
      } finally {
        setLoading(false);
      }
    }

    fetchNodes();
  }, []);

  return (
    <section className="card">
      <header className="card-header">
        <h2>Mesh Nodes</h2>
      </header>
      <div className="card-body">
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading nodes…</div>
        ) : (
          <table className="nodes-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr key={n.id}>
                  <td>{n.id}</td>
                  <td>{n.name}</td>
                  <td>{n.deviceType}</td>
                  <td>
                    <span
                      className={
                        'pill ' +
                        (n.status === 'online'
                          ? 'pill-green'
                          : n.status === 'degraded'
                          ? 'pill-warning'
                          : 'pill-danger')
                      }
                    >
                      {n.status}
                    </span>
                  </td>
                  <td>{n.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
