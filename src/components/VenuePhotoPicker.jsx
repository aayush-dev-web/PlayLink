import { useEffect, useState } from 'react'

export default function VenuePhotoPicker({ id, file, currentUrl, onChange, className = '' }) {
  const [previewUrl, setPreviewUrl] = useState(currentUrl || '')

  useEffect(() => {
    if (!file) {
      setPreviewUrl(currentUrl || '')
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, currentUrl])

  return (
    <div className={`venue-photo-picker ${className}`}>
      <label htmlFor={id}>Venue photo <span>(optional · JPG, PNG, WebP · max 5 MB)</span></label>
      <div className="venue-photo-picker-control">
        {previewUrl
          ? <img className="venue-photo-preview" src={previewUrl} alt="Venue photo preview" />
          : <span className="venue-photo-placeholder" aria-hidden="true">Photo</span>}
        <span className="venue-photo-picker-action">
          <input id={id} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { onChange(event.target.files?.[0] || null); event.currentTarget.value = '' }} />
          <small>{file ? file.name : currentUrl ? 'Choose a new photo to replace this one' : 'Choose a photo from your device'}</small>
        </span>
      </div>
    </div>
  )
}
