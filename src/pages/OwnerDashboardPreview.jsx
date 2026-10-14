import { Link } from 'react-router-dom'
import Brand from '../components/Brand.jsx'
import Icon from '../components/Icon.jsx'
import './ownerDashboardPreview.css'

const navigation = [
  ['Dashboard', 'home'],
  ['Bookings', 'calendar'],
  ['Inbox', 'message'],
  ['Schedule', 'clock'],
  ['Your Venue', 'venue'],
  ['Reviews', 'star'],
  ['Live scores', 'chart'],
  ['Settings', 'settings'],
]

const bookings = [
  { day: 'Today · 4:00 PM', name: 'Aarav Shrestha', sport: 'Futsal', price: 'Rs 2,500', status: 'confirmed' },
  { day: 'Today · 6:30 PM', name: 'Sanjana Rana', sport: 'Futsal', price: 'Rs 2,500', status: 'pending' },
  { day: 'Tomorrow · 8:00 AM', name: 'Kirtipur Cricket Club', sport: 'Cricket', price: 'Rs 4,000', status: 'confirmed' },
]

const reviews = [
  { initials: 'AS', name: 'Aarav Shrestha', stars: 5, text: 'Great pitch and friendly staff. We will book again.' },
  { initials: 'SR', name: 'Sanjana Rana', stars: 4, text: 'Good facilities and easy to find.' },
]

const chartHeights = [
  [32, 17], [45, 12], [25, 29], [57, 20], [39, 42], [66, 28], [49, 51],
]

export default function OwnerDashboardPreview() {
  return (
    <div className="owner-app owner-demo-app">
      <aside className="owner-sidebar">
        <Brand light href="/owner-preview" />
        <div className="owner-venue-identity">
          <span className="owner-venue-thumb"><img src="/sports/fut1.png" alt="" /></span>
          <span><b>The Matchday Arena <i aria-label="Active demo venue">✓</i></b><small>Futsal Venue</small></span>
          <Icon name="chevron-right" size={15} />
        </div>
        <nav className="owner-nav" aria-label="Venue owner demo navigation">
          {navigation.map(([label, icon], index) => (
            <span key={label} className={`owner-demo-nav-item${index === 0 ? ' active' : ''}`} aria-current={index === 0 ? 'page' : undefined}>
              {label === 'Settings' ? <img src="/settings-icon.png" alt="" /> : <Icon name={icon} size={17} />}<span>{label}</span>
            </span>
          ))}
        </nav>
        <div className="owner-demo-sidebar-note">DEMO WORKSPACE<br /><small>Sample data · read only</small></div>
      </aside>
      <div className="owner-main">
        <header className="owner-topbar">
          <span className="owner-topbar-spacer" />
          <Link className="owner-demo-toplink" to="/venues"><Icon className="owner-demo-back-icon" name="arrow-right" size={14} /> Back to venues</Link>
          <Link className="owner-primary-button owner-demo-signup" to="/get-started">Create owner account</Link>
        </header>
        <main className="owner-content">
          <div className="owner-demo-banner" role="note">
            <span><Icon name="info" size={16} /></span>
            <div><b>Venue owner dashboard preview</b><small>This is a read-only demo with sample bookings and venue activity. No changes are saved.</small></div>
            <Link to="/get-started">Get started <Icon name="arrow-right" size={13} /></Link>
          </div>
          <section className="owner-page owner-overview">
            <header className="owner-page-heading">
              <div><span>WELCOME BACK,</span><h1>Venue Owner <span aria-hidden="true">👋</span></h1><p>Here’s what’s happening at The Matchday Arena today.</p></div>
              <span className="owner-date-chip"><Icon name="calendar" size={14} />{new Date().toLocaleDateString('en-NP', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </header>
            <div className="owner-metrics-grid">
              <article className="owner-metric-card"><span className="owner-metric-icon green"><Icon name="calendar" size={18} /></span><small>Total Bookings</small><b>128</b><span className="owner-metric-change"><Icon name="arrow-right" size={11} />8 today</span></article>
              <article className="owner-metric-card"><span className="owner-metric-icon blue"><Icon name="clock" size={18} /></span><small>Total Playing Hours</small><b>46 hrs</b><span className="owner-metric-change"><Icon name="arrow-right" size={11} />Confirmed · last 7 days</span></article>
              <article className="owner-metric-card"><span className="owner-metric-icon amber"><Icon name="star" size={18} /></span><small>Average Rating</small><b>4.8</b><span className="owner-metric-change"><Icon name="arrow-right" size={11} />36 guest reviews</span></article>
            </div>
            <div className="owner-overview-grid">
              <div className="owner-overview-main">
                <section className="owner-panel owner-booking-chart">
                  <div className="owner-panel-heading"><div><h2>Booking Overview</h2><p>Venue bookings · Last 7 days</p></div><span className="owner-demo-panel-label">DEMO DATA</span></div>
                  <div className="owner-chart" aria-label="Sample bookings over the last seven days">
                    <div className="owner-chart-axis"><span>12</span><span>8</span><span>4</span><span>0</span></div>
                    <div className="owner-chart-bars">{chartHeights.map(([futsal, cricket], index) => <div className="owner-chart-day" key={index}><div className="owner-chart-columns"><span className="futsal" style={{ height: `${futsal}%` }} /><span className="cricket" style={{ height: `${cricket}%` }} /></div><b>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]}</b></div>)}</div>
                    <div className="owner-chart-legend"><span><i className="futsal" />Futsal</span><span><i className="cricket" />Cricket</span></div>
                  </div>
                </section>
                <div className="owner-lower-grid">
                  <section className="owner-panel owner-usage-panel">
                    <div className="owner-panel-heading"><div><h2>Venue Usage</h2><p>Confirmed playing hours this week</p></div></div>
                    <div className="owner-usage-list">
                      <div className="owner-usage-item"><span className="owner-usage-ring" style={{ '--usage': '72%' }}><b>72%</b></span><strong>Futsal Court</strong><small>36 of 50 hours</small></div>
                      <div className="owner-usage-item"><span className="owner-usage-ring blue" style={{ '--usage': '54%' }}><b>54%</b></span><strong>Cricket Nets</strong><small>19 of 35 hours</small></div>
                    </div>
                  </section>
                  <section className="owner-panel owner-review-panel">
                    <div className="owner-panel-heading"><div><h2>Recent Reviews</h2><p>Feedback from players</p></div></div>
                    <div className="owner-review-list compact">{reviews.map((review) => <article className="owner-review-row" key={review.name}><span className="owner-review-avatar">{review.initials}</span><div><b>{review.name}</b><span className="owner-review-stars">{'★'.repeat(review.stars)}{'☆'.repeat(5 - review.stars)}</span><p>{review.text}</p><small>Sample review · demo</small></div></article>)}</div>
                  </section>
                </div>
              </div>
              <aside className="owner-overview-aside">
                <section className="owner-panel owner-upcoming-panel">
                  <div className="owner-panel-heading"><div><h2>Upcoming Bookings</h2><p>Sample reservations</p></div><span className="owner-demo-panel-label">DEMO</span></div>
                  <div className="owner-booking-list">{bookings.map((booking) => <article className="owner-booking-row owner-demo-booking" key={`${booking.day}-${booking.name}`}><div className="owner-booking-date"><b>{booking.day}</b><small>{booking.sport}</small></div><div className="owner-booking-customer"><b>{booking.name}</b><small>{booking.sport === 'Cricket' ? 'Cricket Nets' : 'Futsal Court'}</small></div><span className={`owner-booking-status ${booking.status}`}><i />{booking.status}</span><div className="owner-booking-meta"><b>{booking.price}</b></div></article>)}</div>
                </section>
                <section className="owner-panel owner-quick-actions">
                  <div className="owner-panel-heading"><h2>Quick Actions</h2></div>
                  <div className="owner-demo-action"><Icon name="calendar" size={16} /><span><b>Add New Booking</b><small>Manage requests and reservations</small></span></div>
                  <div className="owner-demo-action"><Icon name="clock" size={16} /><span><b>View Full Schedule</b><small>Set weekly availability</small></span></div>
                  <div className="owner-demo-action"><Icon name="settings" size={16} /><span><b>Manage Venue</b><small>Update details and pricing</small></span></div>
                </section>
                <section className="owner-panel owner-demo-join">
                  <span><Icon name="venue" size={18} /></span><div><b>Ready to manage your venue?</b><small>Create an owner account to get started.</small><Link to="/get-started">Create account <Icon name="arrow-right" size={12} /></Link></div>
                </section>
              </aside>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
