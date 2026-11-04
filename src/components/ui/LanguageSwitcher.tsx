import Button from './Button'
import type { Language } from '../../i18n/translations'
import { translate } from '../../i18n/translations'

type LanguageSwitcherProps = {
  language: Language
  onLanguageChange: (language: Language) => void
}

function LanguageSwitcher({
  language,
  onLanguageChange,
}: LanguageSwitcherProps) {
  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={translate(language, 'languageGroup')}
    >
      <Button
        className="language-switcher__option"
        variant={language === 'hi' ? 'primary' : 'text'}
        aria-pressed={language === 'hi'}
        lang="hi"
        onClick={() => onLanguageChange('hi')}
      >
        हिन्दी
      </Button>
      <Button
        className="language-switcher__option"
        variant={language === 'en' ? 'primary' : 'text'}
        aria-pressed={language === 'en'}
        lang="en"
        onClick={() => onLanguageChange('en')}
      >
        English
      </Button>
    </div>
  )
}

export default LanguageSwitcher
