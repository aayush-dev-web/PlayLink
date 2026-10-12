function SocialMark({ name }) {
  if (name === 'instagram') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.7" cy="6.6" r=".8" className="social-icon-fill" /></svg>
  if (name === 'facebook') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 21v-8h2.8l.4-3.2h-3.2v-2c0-.9.3-1.5 1.6-1.5h1.7V3.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.2H7.2V13H10v8z" className="social-icon-fill" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.2 3c.2 2.1 1.4 3.5 3.5 3.7v3.1a8 8 0 0 1-3.5-1v6.4c0 3.3-3.7 5.4-6.6 3.7-2.9-1.7-2.3-6.1.9-7.1a5 5 0 0 1 2.3-.2v3.3c-1.8-.6-3.3.1-3.1 1.5.2 1.3 2.5 1.7 3.2.2.1-.3.2-.7.2-1V3z" className="social-icon-fill" /></svg>
}

const socialNetworks = [
  { key: 'instagram_url', name: 'instagram', label: 'Instagram' },
  { key: 'facebook_url', name: 'facebook', label: 'Facebook' },
  { key: 'tiktok_url', name: 'tiktok', label: 'TikTok' },
]

export default function SocialLinks({ profile, className = '' }) {
  const linkedNetworks = socialNetworks.filter(({ key }) => profile?.[key])
  if (!linkedNetworks.length) return null

  return (
    <div className={`profile-social-preview ${className}`.trim()} aria-label="Linked social accounts">
      {linkedNetworks.map((network) => (
        <a key={network.key} href={profile[network.key]} target="_blank" rel="noreferrer" aria-label={`Open linked ${network.label} account`} title={network.label}>
          <SocialMark name={network.name} />
        </a>
      ))}
    </div>
  )
}
