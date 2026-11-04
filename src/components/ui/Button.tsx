import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'text'

type SharedProps = {
  children: ReactNode
  className?: string
  variant?: ButtonVariant
}

type ButtonProps = SharedProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never
  }

type LinkButtonProps = SharedProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
  }

function Button(props: ButtonProps | LinkButtonProps) {
  if (props.href !== undefined) {
    const {
      children,
      className = '',
      variant = 'primary',
      href,
      ...linkProps
    } = props
    return (
      <a
        className={`button button--${variant} ${className}`.trim()}
        href={href}
        {...linkProps}
      >
        {children}
      </a>
    )
  }

  const {
    children,
    className = '',
    variant = 'primary',
    ...buttonProps
  } = props
  return (
    <button
      className={`button button--${variant} ${className}`.trim()}
      type="button"
      {...buttonProps}
    >
      {children}
    </button>
  )
}

export default Button
