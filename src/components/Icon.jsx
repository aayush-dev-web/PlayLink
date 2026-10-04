const iconContent = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>,
  venue: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h2m4 0h2m-8 3h2" /></>,
  teams: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1H3Zm13-13a3 3 0 0 1 0 6m2 7v-1a6 6 0 0 0-3-5.2" /></>,
  player: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  soccer: <><circle cx="12" cy="12" r="9" /><path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2 12 7Zm-3 2.2-3.4-.5m8.4.5 3.4-.5M10.1 12.7l-2 3.1m5.8-3.1 2 3.1m-7.8-.6L12 17l3.9-1.8" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /></>,
  'shield-check': <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  field: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M12 4v16m-9-8h4v6H3m18-6h-4v6h4" /><circle cx="12" cy="12" r="2.5" /></>,
  filter: <><path d="M4 5h16l-6.5 7.5v5l-3 1.5v-6.5L4 5Z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  add: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8m-4-4h8" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
  message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /><path d="M8 11h8m-8 3h5" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.6-1.4-2.4 1.4-1.1a8 8 0 0 1 0-1.9l-1.4-1.2 1.4-2.4 1.7.7a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.7 1.4 2.4-1.4 1.2a8 8 0 0 1 0 1.8Z" /></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  walk: <><circle cx="14" cy="4" r="2" /><path d="m12 8-3 4 3 2 1 6m-4-8-3 5-3 1m9-6 4 3 3 1m-8-6 4 2" /></>,
  bike: <><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="m6 17 4-7h4l4 7m-8-7-2-3h4m0 3 2 4h-5" /></>,
  bus: <><rect x="4" y="3" width="16" height="16" rx="3" /><path d="M4 12h16M8 19v2m8-2v2M8 7h8" /><circle cx="8" cy="15.5" r="1" /><circle cx="16" cy="15.5" r="1" /></>,
  car: <><path d="m5 11 1.5-5h11L19 11l2 2v5h-2m-14 0H3v-5l2-2Z" /><path d="M5 11h14M7 18v2m10-2v2" /><circle cx="7" cy="15" r="1" /><circle cx="17" cy="15" r="1" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.2 5-4.8 2 2-4.8 5-2.2Z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>,
  chart: <><path d="M4 20V5m0 15h17" /><path d="m7 15 4-4 3 2 6-7" /><path d="M16 6h4v4" /></>,
  edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15v5Z" /></>,
  trash: <><path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v7m4-7v7" /></>,
  phone: <><path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M11 18h2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 17v4h14v-4" /></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15m6-12v15" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v3" /></>,
  cricket: <><path d="m13.6 3.2 3.2 3.2-7.7 7.7-3.2-3.2 7.7-7.7Z" /><path d="m5.9 11.6-2.3 2.3a2.25 2.25 0 0 0 3.2 3.2l2.3-2.3m5.1-.1v6m3-6v6m3-6v6m-7-6h8" /><circle cx="6" cy="5" r="1.5" /><path d="M5.2 3.7c1 .7 1.5 1.5 1.6 2.6" /></>,
  currency: <text x="3" y="16.5" fill="currentColor" stroke="none" fontFamily="Arial, sans-serif" fontSize="11" fontWeight="700" letterSpacing="-.5">Rs</text>,
  expand: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /><path d="m3 3 6 6m12-6-6 6M3 21l6-6m12 6-6-6" /></>,
  collapse: <><path d="M8 3v5H3m13-5v5h5M3 16h5v5m13-5h-5v5" /><path d="m3 3 6 6m12-6-6 6M3 21l6-6m12 6-6-6" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.7-2.5L20 12M4 12l2.7 5.5A7 7 0 0 0 18.4 15" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  'arrow-right': <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  lightning: <path d="m13 2-3 8h7l-6 12 2-9H6l7-11Z" />,
  heart: <><path d="M20.8 8.8c0 5.1-8.8 10.1-8.8 10.1S3.2 13.9 3.2 8.8a4.5 4.5 0 0 1 8.8-1.3 4.5 4.5 0 0 1 8.8 1.3Z" /></>,
}

export default function Icon({ name, size = 20, strokeWidth = 1.8, ...props }) {
  if (name === 'cricket' || name === 'futsal') {
    const iconClass = name === 'cricket' ? 'icon-cricket-mask' : 'icon-futsal-mask'
    return <span aria-hidden="true" className={`${iconClass}${props.className ? ` ${props.className}` : ''}`} style={{ width: size, height: size }} />
  }

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...props}
    >
      {iconContent[name] || iconContent.compass}
    </svg>
  )
}
