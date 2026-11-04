type SectionHeadingProps = {
  eyebrow?: string
  title: string
  description?: string
  titleId?: string
}

function SectionHeading({
  eyebrow,
  title,
  description,
  titleId,
}: SectionHeadingProps) {
  return (
    <div className="section-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="section-heading__title" id={titleId}>
        {title}
      </h2>
      {description && (
        <p className="section-heading__description">{description}</p>
      )}
    </div>
  )
}

export default SectionHeading
