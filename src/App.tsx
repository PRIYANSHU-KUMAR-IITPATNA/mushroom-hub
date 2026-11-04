import { useEffect, useState } from 'react'
import Footer from './components/layout/Footer'
import Header from './components/layout/Header'
import Button from './components/ui/Button'
import Card from './components/ui/Card'
import Container from './components/ui/Container'
import SectionHeading from './components/ui/SectionHeading'
import type { Language, TranslationKey } from './i18n/translations'
import { translate } from './i18n/translations'
import FarmerPortal from './farmer/FarmerPortal'
import BuyerPortal from './buyer/BuyerPortal'
import AdminPortal from './admin/AdminPortal'

const LANGUAGE_STORAGE_KEY = 'mushroom-hub-language'

function getInitialLanguage(): Language {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'hi'
      ? 'hi'
      : 'en'
  } catch {
    return 'en'
  }
}

const processSteps: {
  title: TranslationKey
  description: TranslationKey
}[] = [
  { title: 'stepOneTitle', description: 'stepOneDescription' },
  { title: 'stepTwoTitle', description: 'stepTwoDescription' },
  { title: 'stepThreeTitle', description: 'stepThreeDescription' },
  { title: 'stepFourTitle', description: 'stepFourDescription' },
]

const farmerBenefits: TranslationKey[] = [
  'farmerBenefitTraining',
  'farmerBenefitBags',
  'farmerBenefitGuidance',
  'farmerBenefitIntake',
  'farmerBenefitRecords',
]

const buyerBenefits: TranslationKey[] = [
  'buyerBenefitSource',
  'buyerBenefitGrade',
  'buyerBenefitEnquiry',
]

function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage)
  const [pathname, setPathname] = useState(() =>
    window.location.pathname.replace(/\/+$/, '') || '/',
  )

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname.replace(/\/+$/, '') || '/')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    } catch {
      return
    }
  }, [language])

  useEffect(() => {
    if (
      pathname === '/farmer' ||
      pathname.startsWith('/buyer') ||
      pathname.startsWith('/admin')
    ) return
    document.documentElement.lang = language
    document.title = translate(language, 'pageTitle')
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    if (description) {
      description.content = translate(language, 'pageDescription')
    }
  }, [pathname, language])

  if (pathname === '/farmer') {
    return (
      <FarmerPortal
        language={language}
        onLanguageChange={setLanguage}
      />
    )
  }
  if (pathname === '/buyer' || pathname.startsWith('/buyer/')) {
    return <BuyerPortal language={language} onLanguageChange={setLanguage} />
  }
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return <AdminPortal language={language} onLanguageChange={setLanguage} />
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {translate(language, 'skipToContent')}
      </a>
      <Header language={language} onLanguageChange={setLanguage} />

      <main id="main-content" tabIndex={-1}>
        <section className="hero-section" aria-labelledby="hero-title">
          <Container className="hero-section__inner">
            <div className="hero-copy">
              <p className="eyebrow">
                {translate(language, 'heroEyebrow')}
              </p>
              <h1 className="hero-title" id="hero-title">
                {translate(language, 'heroTitle')}
              </h1>
              <p className="hero-description">
                {translate(language, 'heroDescription')}
              </p>
              <p className="hero-location">
                <span className="hero-location__dot" aria-hidden="true" />
                {translate(language, 'heroLocation')}
              </p>
              <div className="hero-actions">
                <Button href="/farmer">
                  {translate(language, 'becomeFarmer')}
                </Button>
                <Button href="/buyer" variant="secondary">
                  {translate(language, 'buyFresh')}
                </Button>
              </div>
            </div>
            <div className="hero-visual">
              <div
                className="mushroom-illustration"
                role="img"
                aria-label={translate(language, 'heroVisualLabel')}
              >
                <span className="mushroom-illustration__cap" />
                <span className="mushroom-illustration__gills" />
                <span className="mushroom-illustration__stem" />
                <span className="mushroom-illustration__leaf" />
                <span className="mushroom-illustration__ground" />
              </div>
              <span className="hero-visual__caption" aria-hidden="true">
                {translate(language, 'heroVisualCaption')}
              </span>
            </div>
          </Container>
        </section>

        <section
          className="how-section page-section"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <Container>
            <SectionHeading
              eyebrow={translate(language, 'howEyebrow')}
              title={translate(language, 'howTitle')}
              description={translate(language, 'howDescription')}
              titleId="how-title"
            />
            <ol className="process-grid">
              {processSteps.map(({ title, description }, index) => (
                <li className="process-grid__item" key={title}>
                  <Card className="process-card">
                    <span className="process-card__number" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="process-card__title">
                      {translate(language, title)}
                    </h3>
                    <p className="process-card__description">
                      {translate(language, description)}
                    </p>
                  </Card>
                </li>
              ))}
            </ol>
            <p className="model-note">
              <span className="model-note__marker" aria-hidden="true">
                i
              </span>
              {translate(language, 'plannedModelNote')}
            </p>
          </Container>
        </section>

        <section
          className="audience-section farmer-section"
          id="farmers"
          aria-labelledby="farmers-title"
        >
          <Container className="audience-section__inner">
            <div className="audience-copy">
              <SectionHeading
                eyebrow={translate(language, 'farmerEyebrow')}
                title={translate(language, 'farmerTitle')}
                description={translate(language, 'farmerDescription')}
                titleId="farmers-title"
              />
              <Button href="/farmer">
                {translate(language, 'becomeFarmer')}
              </Button>
            </div>
            <Card className="benefits-card">
              <ul className="benefits-list">
                {farmerBenefits.map((benefit) => (
                  <li className="benefits-list__item" key={benefit}>
                    <span className="benefits-list__mark" aria-hidden="true">
                      +
                    </span>
                    {translate(language, benefit)}
                  </li>
                ))}
              </ul>
              <div className="entry-note" id="farmer-entry">
                <h3 className="entry-note__title">
                  {translate(language, 'farmerEntryLabel')}
                </h3>
                <p>{translate(language, 'farmerEntryNote')}</p>
              </div>
            </Card>
          </Container>
        </section>

        <section
          className="audience-section buyer-section"
          id="buyers"
          aria-labelledby="buyers-title"
        >
          <Container className="audience-section__inner audience-section__inner--buyer">
            <div className="audience-copy">
              <SectionHeading
                eyebrow={translate(language, 'buyerEyebrow')}
                title={translate(language, 'buyerTitle')}
                description={translate(language, 'buyerDescription')}
                titleId="buyers-title"
              />
              <Button href="/buyer">
                {translate(language, 'buyFresh')}
              </Button>
            </div>
            <Card className="buyer-card">
              <p className="buyer-card__eyebrow">
                {translate(language, 'buyerEntryLabel')}
              </p>
              <ul className="benefits-list">
                {buyerBenefits.map((benefit) => (
                  <li className="benefits-list__item" key={benefit}>
                    <span className="benefits-list__mark" aria-hidden="true">
                      +
                    </span>
                    {translate(language, benefit)}
                  </li>
                ))}
              </ul>
              <div className="entry-note" id="buyer-entry">
                <p>{translate(language, 'buyerEntryNote')}</p>
              </div>
            </Card>
          </Container>
        </section>

        <section
          className="about-section page-section"
          id="about"
          aria-labelledby="about-title"
        >
          <Container className="about-section__inner">
            <div className="about-section__stamp" aria-hidden="true">
              <span>MH</span>
              <span>{translate(language, 'locationStamp')}</span>
            </div>
            <div className="about-section__copy">
              <SectionHeading
                eyebrow={translate(language, 'aboutEyebrow')}
                title={translate(language, 'aboutTitle')}
                description={translate(language, 'aboutDescription')}
                titleId="about-title"
              />
              <p className="about-location">
                {translate(language, 'aboutLocation')}
              </p>
            </div>
          </Container>
        </section>

        <section
          className="final-cta"
          id="get-started"
          aria-labelledby="final-title"
        >
          <Container className="final-cta__inner">
            <p className="eyebrow eyebrow--light">
              {translate(language, 'finalEyebrow')}
            </p>
            <h2 className="final-cta__title" id="final-title">
              {translate(language, 'finalTitle')}
            </h2>
            <p className="final-cta__description">
              {translate(language, 'finalDescription')}
            </p>
            <div className="final-cta__actions">
              <Button href="/farmer" variant="secondary">
                {translate(language, 'farmerPath')}
              </Button>
              <Button href="/buyer" variant="text">
                {translate(language, 'buyerPath')}
              </Button>
            </div>
          </Container>
        </section>
      </main>

      <Footer language={language} />
    </div>
  )
}

export default App
