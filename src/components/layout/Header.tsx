import Container from '../ui/Container'
import LanguageSwitcher from '../ui/LanguageSwitcher'
import type { Language, TranslationKey } from '../../i18n/translations'
import { translate } from '../../i18n/translations'

type HeaderProps = {
  language: Language
  onLanguageChange: (language: Language) => void
  isHome?: boolean
}

const navigation: { label: TranslationKey; href: string }[] = [
  { label: 'navHowItWorks', href: '#how-it-works' },
  { label: 'navFarmers', href: '#farmers' },
  { label: 'navBuyers', href: '#buyers' },
  { label: 'navAbout', href: '#about' },
]

function Header({ language, onLanguageChange, isHome = true }: HeaderProps) {
  const sectionHref = (section: string) =>
    isHome ? `#${section}` : `/#${section}`

  return (
    <header className="site-header" id="top">
      <Container className="site-header__inner">
        <a
          className="brand"
          href={isHome ? '#top' : '/'}
          aria-label={translate(language, 'brandName')}
        >
          <span className="brand__mark" aria-hidden="true">
            M
          </span>
          <span className="brand__text">
            <span className="brand__name">{translate(language, 'brandName')}</span>
            <span className="brand__descriptor">
              {translate(language, 'brandDescriptor')}
            </span>
          </span>
        </a>

        <nav
          className="site-nav"
          aria-label={translate(language, 'navigationLabel')}
        >
          {navigation.map(({ label, href }) => (
            <a
              className="site-nav__link"
              href={sectionHref(href.slice(1))}
              key={label}
            >
              {translate(language, label)}
            </a>
          ))}
        </nav>

        <div className="site-header__tools">
          <LanguageSwitcher
            language={language}
            onLanguageChange={onLanguageChange}
          />
          <a
            className="button button--primary site-header__action"
            href={isHome ? '#get-started' : '/become-a-farmer#registration'}
          >
            {translate(language, 'getStarted')}
          </a>
        </div>
      </Container>
    </header>
  )
}

export default Header
