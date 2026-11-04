import type { HTMLAttributes } from 'react'

type CardProps = HTMLAttributes<HTMLElement>

function Card({ children, className = '', ...props }: CardProps) {
  return (
    <article className={`card ${className}`.trim()} {...props}>
      {children}
    </article>
  )
}

export default Card
