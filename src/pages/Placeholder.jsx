const content = {
  'sign-in': { eyebrow: 'WELCOME BACK', title: 'Your next game is waiting.', description: 'Sign-in is not part of this phase. Player accounts and authentication are planned for a later PlayLink release.', action: 'Explore the community', href: '/players' },
  'get-started': { eyebrow: 'COME PLAY', title: 'There’s a place for you here.', description: 'Player and organizer onboarding will be added in a future phase. For now, explore the sample venues, events, and community.', action: 'Explore venues', href: '/venues' },
  'list-venue': { eyebrow: 'FOR VENUE OWNERS', title: 'Bring your venue to the community.', description: 'Venue onboarding and schedule management are planned for a future phase. This demo doesn’t collect or submit venue details.', action: 'Discover venues', href: '/venues' },
  'not-found': { eyebrow: '404 · PAGE NOT FOUND', title: 'We couldn’t find that page.', description: 'The link may be broken, or the page may have moved. Let’s get you back in the game.', action: 'Back to PlayLink', href: '/' },
}

export default function Placeholder({ kind }) {
  const page = content[kind] || content['not-found']
  const isNotFound = kind === 'not-found'
  return <section className={`placeholder-page page-container${isNotFound ? ' not-found-page' : ''}`} aria-labelledby="placeholder-title">
    {!isNotFound && <div className="placeholder-mark" aria-hidden="true">PL<span>.</span></div>}
    <span className="eyebrow">{page.eyebrow}</span>
    {isNotFound && <span className="not-found-code" aria-hidden="true">404</span>}
    <h1 id="placeholder-title">{page.title}</h1>
    <p>{page.description}</p>
    <a className="button button-primary" href={page.href}>{page.action} <span aria-hidden="true">↗</span></a>
    {!isNotFound && <span className="placeholder-demo">Phase 1 · frontend demo</span>}
  </section>
}
