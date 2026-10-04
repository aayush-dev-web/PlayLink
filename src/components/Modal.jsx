import { useEffect } from 'react'

export default function Modal({ title, eyebrow = 'PLAYLINK DEMO', onClose, children }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close dialog">×</button>
        <span className="eyebrow">{eyebrow}</span>
        <h2 id="modal-title">{title}</h2>
        {children}
      </section>
    </div>
  )
}
