import { useSyncExternalStore } from 'react';
const subscribe = (callback: () => void) => {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
};
export function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
export function useRoute() {
  const path = useSyncExternalStore(subscribe, () => window.location.pathname);
  const match = /^\/(host|join)\/([A-Z2-9]{8})\/?$/i.exec(path);
  return {
    path,
    role: match?.[1] === 'host' ? ('host' as const) : ('player' as const),
    code: match?.[2]?.toUpperCase(),
  };
}
