import { Link } from 'react-router-dom'
import './terms.css'

const sections = [
  {
    title: '1. Eligibility and your account',
    paragraphs: [
      'You must be at least 18 years old to create a PlayLink account. By registering, you confirm that the information you provide is accurate and that you are legally able to agree to these Terms.',
      'Keep your sign-in details confidential. You are responsible for activity through your account and must tell PlayLink promptly if you believe someone else has accessed it. Do not create an account for another person without their permission.',
    ],
  },
  {
    title: '2. Using PlayLink',
    paragraphs: [
      'PlayLink helps people discover sports venues, players, teams, and events. You agree to use the service lawfully and respectfully, and not to harass, threaten, impersonate, defraud, or discriminate against anyone.',
      'Do not misuse the service, interfere with its operation or security, scrape it without permission, or post content that is unlawful, misleading, abusive, or infringes another person’s rights.',
    ],
  },
  {
    title: '3. Venues, events, and bookings',
    paragraphs: [
      'Venue owners are responsible for accurate listings, location details, prices, availability, facilities, and their communications with players. Players should confirm current details with the venue before travelling or paying.',
      'A listing, event, or message on PlayLink is not a guarantee that a venue is open, that a place is available, or that an activity is safe or suitable. Any booking, payment, cancellation, and refund arrangements are between the people involved unless PlayLink explicitly says otherwise.',
      'PlayLink does not operate venues or supervise games. Use reasonable care, follow venue rules, and make your own decisions about participation and safety.',
    ],
  },
  {
    title: '4. Location and information',
    paragraphs: [
      'You choose whether to provide a home area or venue location. If you choose GPS, your browser asks for permission. Location information you submit is used to support account profiles and location-related features.',
      'When you open a map or request directions, the relevant location may be sent to the map provider to display the map or calculate directions. Review the service’s privacy information and your browser’s location controls before sharing precise location.',
    ],
  },
  {
    title: '5. Your content',
    paragraphs: [
      'You keep ownership of content you submit. You give PlayLink permission to host, display, and use that content as needed to operate and improve the features you choose to use.',
      'Only share content you have the right to use. Do not post another person’s private information without permission. You can remove content where the service provides that option; copies may remain where needed for safety, legal, or operational reasons.',
    ],
  },
  {
    title: '6. Suspension and availability',
    paragraphs: [
      'PlayLink may restrict or suspend access when reasonably necessary to protect people, investigate suspected misuse, comply with law, or maintain the service. Where appropriate, PlayLink will explain the reason and available review options.',
      'The service may change or be unavailable from time to time. PlayLink does not promise uninterrupted access or that every listing or user-provided detail is verified.',
    ],
  },
  {
    title: '7. Disclaimers and liability',
    paragraphs: [
      'To the extent permitted by law, PlayLink is provided “as is” and “as available.” PlayLink is not responsible for the conduct of users, the condition or availability of third-party venues, or decisions made using user-submitted listings.',
      'Nothing in these Terms excludes rights or liability that cannot legally be excluded. To the extent permitted by law, PlayLink is not liable for indirect or consequential losses arising from use of the service.',
    ],
  },
  {
    title: '8. Changes and contact',
    paragraphs: [
      'PlayLink may update these Terms as the service changes. Material updates will be identified on this page or communicated through the service. Continued use after an update takes effect means you accept the updated Terms.',
      'For questions about these Terms, contact the PlayLink team through the Contact admin option in the app.',
    ],
  },
]

export default function Terms() {
  return (
    <main className="terms-page">
      <header className="terms-header">
        <Link to="/get-started" className="terms-back-link">← Back to registration</Link>
        <span className="terms-eyebrow">PLAYLINK · TERMS OF SERVICE</span>
        <h1>Terms and Conditions</h1>
        <p>Effective 12 October 2026 · Version 1.0</p>
      </header>
      <div className="terms-notice" role="note">
        These terms describe the PlayLink service. They are not legal advice; have them reviewed for the laws and locations where PlayLink operates.
      </div>
      <div className="terms-content">
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
      </div>
      <footer className="terms-footer">
        <Link to="/get-started">Return to registration</Link>
        <Link to="/sign-in">Already have an account? Sign in</Link>
      </footer>
    </main>
  )
}
