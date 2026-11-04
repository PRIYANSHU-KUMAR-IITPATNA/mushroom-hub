import Container from '../ui/Container'
import type { Language } from '../../i18n/translations'
import { translate } from '../../i18n/translations'

type FooterProps = {
  language: Language
}

function Footer({ language }: FooterProps) {
  return (
    <footer className="site-footer" id="footer">
      <Container className="site-footer__inner">
        <a className="brand site-footer__brand" href="#top">
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
          <a className="site-footer__link" href="#how-it-works">
            {translate(language, 'navHowItWorks')}
          </a>
          <a className="site-footer__link" href="#farmers">
            {translate(language, 'navFarmers')}
          </a>
          <a className="site-footer__link" href="#buyers">
            {translate(language, 'navBuyers')}
          </a>
          <a className="site-footer__link" href="#about">
            {translate(language, 'navAbout')}
          </a>
        </nav>
        <a className="site-footer__link site-footer__top" href="#top">
          {translate(language, 'backToTop')}
        </a>
      </Container>
    </footer>
  )
}

export default Footer
