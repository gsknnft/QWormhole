import { MeshStatusCard } from '@components/MeshStatusCard';
import { RecentEventsCard } from '@components/RecentEventsCard';

export function DashboardPage() {
  return (
    <div className="grid" style={{ display: 'grid', gap: 16, gridTemplateColumns: '2.1fr 1.4fr' }}>
      <MeshStatusCard />
      <RecentEventsCard />
    </div>
  );
}
