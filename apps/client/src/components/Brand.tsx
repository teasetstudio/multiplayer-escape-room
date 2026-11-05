export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'brand-small' : ''}`}>
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M7 15V7h8m10 0h8v8M7 25v8h8m10 0h8v-8" stroke="currentColor" strokeWidth="3" />
        <circle cx="20" cy="20" r="5" fill="currentColor" />
      </svg>
      <span>
        common
        <br className="brand-break" /> ground<span className="brand-period">.</span>
      </span>
    </div>
  );
}
export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h16m-6-6 6 6-6 6'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
