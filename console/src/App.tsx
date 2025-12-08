import { Routes, Route, Navigate } from 'react-router-dom';
import { ConsoleShell } from '@components/ConsoleShell';
import { DashboardPage } from '@routes/DashboardPage';
import { NodesPage } from '@routes/NodesPage';
import { QWormholePage } from '@routes/QWormholePage';


export default function Console() {
  return (
    <ConsoleShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/nodes" element={<NodesPage />} />
        <Route path="/qwormhole" element={<QWormholePage />} />
      </Routes>
    </ConsoleShell>
  );
}
