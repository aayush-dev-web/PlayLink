import Brand from './Brand.jsx'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main page-container">
        <div className="footer-brand-block">
          <Brand light />
          <p>Good games start with good connections. Find your ground, your game, and your people.</p>
        </div>
        <div className="footer-links">
          <h2>Explore</h2>
          <a href="/venues">Find Venues</a>
          <a href="/events">Discover Events</a>
          <a href="/players">Find Players</a>
          <a href="/teams">Find Teams</a>
        </div>
        <div className="footer-links">
          <h2>Get involved</h2>
          <a href="/list-venue">List Your Venue</a>
          <a href="/get-started">Join PlayLink</a>
          <a href="/sign-in">Sign In</a>
        </div>
        <div className="footer-note">
          <span className="footer-kicker">MADE FOR THE LOVE OF THE GAME</span>
          <p>Connecting local players, teams, and venues—one game at a time.</p>
        </div>
      </div>
      <div className="footer-bottom page-container">
        <span>© 2026 PlayLink · Phase 1 demo</span>
        <span>Built for the people who play.</span>
      </div>
    </footer>
  )
}
