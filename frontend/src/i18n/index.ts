import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// --- EN namespaces ---
import enCommon from '../locales/en/common.json';
import enNavigation from '../locales/en/navigation.json';
import enAuth from '../locales/en/auth.json';
import enDashboard from '../locales/en/dashboard.json';
import enWorklogs from '../locales/en/worklogs.json';
import enProjects from '../locales/en/projects.json';
import enResourcePlans from '../locales/en/resource-plans.json';
import enOrganization from '../locales/en/organization.json';
import enReports from '../locales/en/reports.json';
import enErrors from '../locales/en/errors.json';
import enValidation from '../locales/en/validation.json';
import enIntroduction from '../locales/en/introduction.json';

// --- KO namespaces ---
import koCommon from '../locales/ko/common.json';
import koNavigation from '../locales/ko/navigation.json';
import koAuth from '../locales/ko/auth.json';
import koDashboard from '../locales/ko/dashboard.json';
import koWorklogs from '../locales/ko/worklogs.json';
import koProjects from '../locales/ko/projects.json';
import koResourcePlans from '../locales/ko/resource-plans.json';
import koOrganization from '../locales/ko/organization.json';
import koReports from '../locales/ko/reports.json';
import koErrors from '../locales/ko/errors.json';
import koValidation from '../locales/ko/validation.json';
import koIntroduction from '../locales/ko/introduction.json';

export const supportedLanguages = ['en', 'ko'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        navigation: enNavigation,
        auth: enAuth,
        dashboard: enDashboard,
        worklogs: enWorklogs,
        projects: enProjects,
        'resource-plans': enResourcePlans,
        organization: enOrganization,
        reports: enReports,
        errors: enErrors,
        validation: enValidation,
        introduction: enIntroduction,
      },
      ko: {
        common: koCommon,
        navigation: koNavigation,
        auth: koAuth,
        dashboard: koDashboard,
        worklogs: koWorklogs,
        projects: koProjects,
        'resource-plans': koResourcePlans,
        organization: koOrganization,
        reports: koReports,
        errors: koErrors,
        validation: koValidation,
        introduction: koIntroduction,
      },
    },
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,
    defaultNS: 'common',
    ns: [
      'common',
      'navigation',
      'auth',
      'dashboard',
      'worklogs',
      'projects',
      'resource-plans',
      'organization',
      'reports',
      'errors',
      'validation',
      'introduction',
    ],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    showSupportNotice: false,
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

export default i18n;
