import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import './ConsoleShell.css';

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <div className="console-root">
      <aside className="console-sidebar">
        <div className="console-logo">
          <span className="logo-mark">⟟</span>
          <div className="logo-text">
            <span className="logo-title">SigilNet</span>
            <span className="logo-sub">Console</span>
          </div>
        </div>

        <nav className="console-nav">
          <NavItem to="/dashboard" label="Dashboard" icon="⟁" />
          <NavItem to="/nodes" label="Nodes / Mesh" icon="⟠" />
          <NavItem to="/qwormhole" label="QWormhole" icon="⟡" />
        </nav>

        <div className="console-footer">
          <span className="badge">alpha · local sovereign</span>
        </div>
      </aside>

      <main className="console-main">
        <header className="console-header">
          <h1>SigilNet Console</h1>
          <div className="console-header-right">
            {/* Later: active profile, mesh status, etc */}
            <span className="pill pill-green">Mesh: local</span>
          </div>
        </header>

        <section className="console-content">{children}</section>
      </main>
    </div>
  );
}

function NavItem(props: { to: string; label: string; icon?: string }) {
  const { to, label, icon } = props;
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        'console-nav-item' + (isActive ? ' console-nav-item--active' : '')
      }
    >
      {icon && <span className="console-nav-icon">{icon}</span>}
      <span>{label}</span>
    </NavLink>
  );
}
