import type { ConnectionView } from '../game/network/GameConnection';
export function StatusPill({ phase }: { phase: ConnectionView['phase'] }) {
  const label =
    phase === 'connected'
      ? 'Connected'
      : phase === 'reconnecting'
        ? 'Reconnecting'
        : phase === 'connecting'
          ? 'Connecting'
          : 'Offline';
  return (
    <span
      className={`status-pill ${phase === 'connected' ? 'is-online' : 'is-pending'}`}
      role="status"
    >
      <i />
      {label}
    </span>
  );
}
