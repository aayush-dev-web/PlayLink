import { useEffect, useRef, useState } from 'react'

const defaultCropSize = 280
const outputSize = 512

function getImageLayout(image, zoom, offset, cropSize) {
  const baseScale = Math.max(cropSize / image.width, cropSize / image.height)
  const scale = baseScale * zoom
  const width = image.width * scale
  const height = image.height * scale
  const maxX = Math.max(0, (width - cropSize) / 2)
  const maxY = Math.max(0, (height - cropSize) / 2)
  return {
    scale,
    width,
    height,
    left: (cropSize - width) / 2 + Math.max(-maxX, Math.min(maxX, offset.x)),
    top: (cropSize - height) / 2 + Math.max(-maxY, Math.min(maxY, offset.y)),
    maxX,
    maxY,
  }
}

export default function ProfilePhotoCropper({ file, onCancel, onApply }) {
  const cropWindow = useRef(null)
  const [cropSize, setCropSize] = useState(defaultCropSize)
  const [image, setImage] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const drag = useRef(null)

  useEffect(() => {
    const element = cropWindow.current
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => setCropSize(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function updateImage(event) {
    const loadedImage = event.currentTarget
    setImage({ width: loadedImage.naturalWidth, height: loadedImage.naturalHeight })
    setOffset({ x: 0, y: 0 })
  }

  function moveCrop(event) {
    if (!drag.current || !image) return
    const layout = getImageLayout(image, zoom, { x: 0, y: 0 }, cropSize)
    setOffset({
      x: Math.max(-layout.maxX, Math.min(layout.maxX, drag.current.x + event.clientX - drag.current.pointerX)),
      y: Math.max(-layout.maxY, Math.min(layout.maxY, drag.current.y + event.clientY - drag.current.pointerY)),
    })
  }

  async function applyCrop() {
    if (!image || !previewUrl || busy) return
    setBusy(true)
    setError('')
    try {
      const source = new Image()
      source.src = previewUrl
      await source.decode()
      const layout = getImageLayout(image, zoom, offset, cropSize)
      const sourceX = -layout.left / layout.scale
      const sourceY = -layout.top / layout.scale
      const sourceSide = cropSize / layout.scale
      const canvas = document.createElement('canvas')
      canvas.width = outputSize
      canvas.height = outputSize
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Photo editing is not supported in this browser.')
      context.drawImage(source, sourceX, sourceY, sourceSide, sourceSide, 0, 0, outputSize, outputSize)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
      if (!blob) throw new Error('The cropped photo could not be created. Try another image.')
      onApply(new File([blob], 'playlink-profile.webp', { type: 'image/webp', lastModified: Date.now() }))
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : 'The photo could not be cropped. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const layout = image ? getImageLayout(image, zoom, offset, cropSize) : null

  return <div className="profile-crop-backdrop">
    <section className="profile-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-crop-heading">
      <header><div><h2 id="profile-crop-heading">Adjust profile photo</h2><p>Drag to position the photo, then zoom to crop it.</p></div><button type="button" aria-label="Cancel photo crop" onClick={onCancel} disabled={busy}>×</button></header>
      <div
        className="profile-crop-window"
        onPointerDown={(event) => {
          if (!image) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { pointerX: event.clientX, pointerY: event.clientY, x: offset.x, y: offset.y }
        }}
        onPointerMove={moveCrop}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onDragStart={(event) => event.preventDefault()}
        aria-label="Drag photo to adjust the crop"
      >
        {previewUrl && <img
          src={previewUrl}
          alt="Photo crop preview"
          onLoad={updateImage}
          draggable="false"
          style={layout ? { width: layout.width, height: layout.height, left: layout.left, top: layout.top } : undefined}
        />}
      </div>
      <label className="profile-crop-zoom">Zoom<input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={!image || busy} /></label>
      {error && <p className="dashboard-profile-message is-error" role="alert">{error}</p>}
      <footer><button type="button" className="button button-outline" onClick={onCancel} disabled={busy}>Cancel</button><button type="button" className="button button-primary" onClick={applyCrop} disabled={!image || busy}>{busy ? 'Cropping…' : 'Use cropped photo'}</button></footer>
    </section>
  </div>
}
