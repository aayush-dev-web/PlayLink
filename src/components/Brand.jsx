export default function Brand({ light = false, href = '/dashboard' }) {
  const label = href === '/owner' ? 'PlayLink owner dashboard' : href === '/dashboard' ? 'PlayLink dashboard' : 'PlayLink home'
  return (
    <a className={`brand${light ? ' brand-light' : ''}`} href={href} aria-label={label}>
      <img className="brand-logo" src="/playlink-logo.png" alt="PlayLink — Find Courts. Join Games. Play Together." />
    </a>
  )
}
