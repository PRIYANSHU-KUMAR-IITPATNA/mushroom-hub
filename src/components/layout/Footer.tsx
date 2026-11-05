import Container from '../ui/Container'
import type { Language } from '../../i18n/translations'
import { translate } from '../../i18n/translations'

type FooterProps = {
  language: Language
  isHome?: boolean
}

function Footer({ language, isHome = true }: FooterProps) {
  const sectionHref = (section: string) =>
    isHome ? `#${section}` : `/#${section}`

  return (
    <footer className="site-footer" id="footer">
      <Container className="site-footer__inner">
        <a className="brand site-footer__brand" href={isHome ? '#top' : '/'}>
          <span className="brand__mark" aria-hidden="true">M</span>
          <span className="brand__text">
            <span className="brand__name">{translate(language, 'brandName')}</span>
            <span className="brand__descriptor">
              {translate(language, 'footerDescriptor')}
            </span>
          </span>
        </a>
        <nav
          className="site-footer__nav"
          aria-label={translate(language, 'footerNavigationLabel')}
        >
          <a className="site-footer__link" href={sectionHref('how-it-works')}>
            {translate(language, 'navHowItWorks')}
          </a>
          <a className="site-footer__link" href={sectionHref('farmers')}>
            {translate(language, 'navFarmers')}
          </a>
          <a className="site-footer__link" href={sectionHref('buyers')}>
            {translate(language, 'navBuyers')}
          </a>
          <a className="site-footer__link" href={sectionHref('about')}>
            {translate(language, 'navAbout')}
          </a>
        </nav>
        <a className="site-footer__link site-footer__top" href={isHome ? '#top' : '/'}>
          {translate(language, 'backToTop')}
        </a>
      </Container>
    </footer>
  )
}

export default Footer
