import { useState } from 'react'
import Brand from './Brand.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

const links = [
  { href: '/dashboard', label: 'Home' },
  { href: '/venues', label: 'Find Venues' },
  { href: '/events', label: 'Events' },
  { href: '/players', label: 'Players & Teams' },
]

export default function Header({ path }) {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Brand />
        <button
          className="menu-toggle"
          type="button"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span /><span /><span />
        </button>
        <nav id="primary-navigation" className={`main-nav${open ? ' is-open' : ''}`} aria-label="Main navigation">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={path === link.href ? 'nav-link active' : 'nav-link'}
              aria-current={path === link.href ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <a className="nav-signin" href={user ? '/dashboard' : '/sign-in'} onClick={() => setOpen(false)}>{user ? 'My Dashboard' : 'Sign In'}</a>
          <a className="button button-primary nav-cta" href={user ? '/dashboard' : '/get-started'} onClick={() => setOpen(false)}>{user ? 'Dashboard' : 'Get Started'}</a>
        </nav>
      </div>
    </header>
  )
}
