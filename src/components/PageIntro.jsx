export default function PageIntro({ eyebrow, title, description, children }) {
  return (
    <section className="page-intro page-container">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </section>
  )
}
