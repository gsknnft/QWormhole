import { useState } from 'react';

type PeerTarget = {
  id: string;
  label: string;
};

const mockPeers: PeerTarget[] = [
  { id: 'rog-ally-x', label: 'ROG Ally X (handheld)' },
  { id: 'legion-go-01', label: 'Legion Go · field console' },
  { id: 'pi-fpga-01', label: 'Pi-FPGA-01 (edge node)' },
  { id: 'flipper-proxy', label: 'Flipper Zero proxy' },
];

export function QWormholePage() {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<string>('rog-ally-x');
  const [status, setStatus] = useState<string | null>(null);

  async function handleSend() {
    if (!file) {
      setStatus('Choose a file first.');
      return;
    }

    setStatus('Opening QWormhole… establishing sovereign tunnel…');

    // TODO: integrate with your sovereign tunnel / WebRTC / WG control plane
    await new Promise((r) => setTimeout(r, 900));

    setStatus(`File "${file.name}" staged for delivery to ${target}.`);
  }

  return (
    <section className="card">
      <header className="card-header">
        <h2>QWormhole · Sovereign File Transit</h2>
      </header>
      <div className="card-body">
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '2.2fr 1.4fr' }}>
          <div>
            <div className="field">
              <label>Select file</label>
              <input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                }}
              />
              {file && (
                <div className="hint">
                  {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              )}
            </div>

            <div className="field">
              <label>Target peer</label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="select"
              >
                {mockPeers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <button className="btn-primary" type="button" onClick={handleSend}>
                Engage QWormhole
              </button>
            </div>

            {status && <div className="status">{status}</div>}
          </div>

          <div className="side-panel">
            <h3>How it will work (planned)</h3>
            <ol>
              <li>📡 Discover target via SigilNet mesh registry</li>
              <li>🔐 Establish SovereignTunnel (WireGuard / PQ handshake)</li>
              <li>🌀 Negotiate QWormhole session (metadata + capabilities)</li>
              <li>📦 Stream file over tunnel / WebRTC / torrent bridge</li>
              <li>🧾 Emit FieldProof event for the session</li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
