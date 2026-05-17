import { useTranslation } from 'react-i18next'

const LANGS = ['en', 'tr', 'bs'] as const

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation()

  return (
    <div className="flex gap-1">
      {LANGS.map((lang) => (
        <button
          key={lang}
          onClick={() => i18n.changeLanguage(lang)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            i18n.resolvedLanguage === lang
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          {t(`language.${lang}`)}
        </button>
      ))}
    </div>
  )
}
