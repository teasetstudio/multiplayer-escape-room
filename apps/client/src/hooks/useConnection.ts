import { useSyncExternalStore } from 'react';
import { connection } from '../game/network/GameConnection';
export function useConnection() {
  return useSyncExternalStore(connection.subscribe, connection.getSnapshot);
}
