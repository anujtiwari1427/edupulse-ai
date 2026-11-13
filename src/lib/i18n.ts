import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      brand: 'EduPulse AI',
      nav: {
        dashboard: 'Dashboard',
        library: 'Library',
        create: 'Create Paper',
        papers: 'Saved Papers',
        templates: 'Templates',
        settings: 'Settings',
        howItWorks: 'How it works',
        features: 'Features',
        privacy: 'Privacy',
        faq: 'FAQ',
        openWorkspace: 'Open Workspace',
      },
      status: {
        savedLocally: 'Saved locally',
        saving: 'Saving…',
        saveError: 'Save issue',
        offlineMode: 'Offline Mode — Everything except AI calls works offline.',
        localOnlyNotice: 'All textbooks, banks, and papers stay on this device.',
      },
      actions: {
        createPaper: 'Create Question Paper',
        uploadTextbook: 'Upload Textbook',
        loadSample: 'Load Sample Class 10 Library',
        exportBackup: 'Export Backup ZIP',
        restoreBackup: 'Restore Backup',
        continue: 'Continue',
        cancel: 'Cancel',
        save: 'Save Changes',
        delete: 'Delete',
        confirm: 'Confirm',
        close: 'Close',
        skip: 'Skip for now',
        backToLanding: 'Public Home',
      },
      dashboard: {
        title: 'Teacher Workspace',
        subtitle: 'Manage your local textbook library, question banks, and exam papers.',
        continueDrafts: 'Recent Question Papers',
        noDraftsTitle: 'No question papers yet',
        noDraftsDesc:
          'Load the CBSE Class 10 Science sample pack or upload your first textbook to begin.',
        quickActions: 'Quick Actions',
        storageHealth: 'Local Storage & Backup',
        librarySummary: 'Library Overview',
      },
      settings: {
        title: 'Workspace Settings',
        subtitle: 'Configure school header defaults, local storage backups, AI provider, and language.',
        tabs: {
          profile: 'School & Profile',
          storage: 'Storage & Backup',
          ai: 'AI Provider',
          appearance: 'Appearance & Language',
          shortcuts: 'Shortcuts',
        },
      },
      onboarding: {
        title: 'Welcome to EduPulse AI',
        subtitle: 'Set up your local-first teaching workspace in under a minute.',
        stepLanguage: 'Language & Board',
        stepStorage: 'Local Folder Sync',
        stepSample: 'Starter Library',
      },
    },
  },
  hi: {
    translation: {
      brand: 'EduPulse AI',
      nav: {
        dashboard: 'डैशबोर्ड',
        library: 'पुस्तकालय',
        create: 'प्रश्नपत्र बनाएँ',
        papers: 'सहेजे गए पत्र',
        templates: 'टेम्पलेट्स',
        settings: 'सेटिंग्स',
        howItWorks: 'यह कैसे काम करता है',
        features: 'विशेषताएँ',
        privacy: 'गोपनीयता',
        faq: 'प्रश्नोत्तर',
        openWorkspace: 'कार्यक्षेत्र खोलें',
      },
      status: {
        savedLocally: 'डिवाइस पर सहेजा गया',
        saving: 'सहेजा जा रहा है…',
        saveError: 'सहेजने में त्रुटि',
        offlineMode: 'ऑफ़लाइन मोड — AI कॉल को छोड़कर सब कुछ ऑफ़लाइन चलता है।',
        localOnlyNotice: 'आपकी सभी पुस्तकें, प्रश्न बैंक और प्रश्नपत्र केवल इसी डिवाइस पर रहते हैं।',
      },
      actions: {
        createPaper: 'नया प्रश्नपत्र बनाएँ',
        uploadTextbook: 'पाठ्यपुस्तक अपलोड करें',
        loadSample: 'कक्षा 10 विज्ञान नमूना लोड करें',
        exportBackup: 'बैकअप ZIP डाउनलोड करें',
        restoreBackup: 'बैकअप पुनर्स्थापित करें',
        continue: 'आगे बढ़ें',
        cancel: 'रद्द करें',
        save: 'बदलाव सहेजें',
        delete: 'हटाएँ',
        confirm: 'पुष्टि करें',
        close: 'बंद करें',
        skip: 'अभी छोड़ें',
        backToLanding: 'मुख्य पृष्ठ',
      },
      dashboard: {
        title: 'शिक्षक कार्यक्षेत्र',
        subtitle: 'अपनी स्थानीय पाठ्यपुस्तकें, प्रश्न बैंक और परीक्षा पत्र प्रबंधित करें।',
        continueDrafts: 'हाल के प्रश्नपत्र',
        noDraftsTitle: 'अभी कोई प्रश्नपत्र नहीं है',
        noDraftsDesc:
          'शुरू करने के लिए CBSE कक्षा 10 विज्ञान नमूना पैक लोड करें या अपनी पाठ्यपुस्तक अपलोड करें।',
        quickActions: 'त्वरित कार्य',
        storageHealth: 'स्थानीय संग्रहण और बैकअप',
        librarySummary: 'पुस्तकालय सारांश',
      },
      settings: {
        title: 'कार्यक्षेत्र सेटिंग्स',
        subtitle: 'विद्यालय विवरण, स्थानीय बैकअप, AI प्रदाता और भाषा सेट करें।',
        tabs: {
          profile: 'विद्यालय और प्रोफ़ाइल',
          storage: 'संग्रहण और बैकअप',
          ai: 'AI प्रदाता',
          appearance: 'थीम और भाषा',
          shortcuts: 'शॉर्टकट्स',
        },
      },
      onboarding: {
        title: 'EduPulse AI में आपका स्वागत है',
        subtitle: 'एक मिनट से भी कम समय में अपना स्थानीय कार्यक्षेत्र तैयार करें।',
        stepLanguage: 'भाषा और बोर्ड',
        stepStorage: 'स्थानीय फ़ोल्डर सिंक',
        stepSample: 'प्रारंभिक पुस्तकालय',
      },
    },
  },
  mr: {
    translation: {
      brand: 'EduPulse AI',
      nav: {
        dashboard: 'डॅशबोर्ड',
        library: 'ग्रंथालय',
        create: 'प्रश्नपत्रिका तयार करा',
        papers: 'जतन केलेल्या पत्रिका',
        templates: 'नमुने',
        settings: 'सेटिंग्ज',
        howItWorks: 'कार्यपद्धती',
        features: 'वैशिष्ट्ये',
        privacy: 'गोपनीयता',
        faq: 'नेहमीचे प्रश्न',
        openWorkspace: 'कार्यक्षेत्र उघडा',
      },
      status: {
        savedLocally: 'डिव्हाइसवर जतन केले',
        saving: 'जतन होत आहे…',
        saveError: 'जतन करताना त्रुटी',
        offlineMode: 'ऑफलाइन मोड — AI कॉल वगळता सर्वकाही ऑफलाइन चालते.',
        localOnlyNotice: 'तुमची सर्व पुस्तके, प्रश्नपेढी आणि प्रश्नपत्रिका फक्त याच डिव्हाइसवर राहतात.',
      },
      actions: {
        createPaper: 'नवीन प्रश्नपत्रिका तयार करा',
        uploadTextbook: 'पाठ्यपुस्तक अपलोड करा',
        loadSample: 'इयत्ता 10 वी विज्ञान नमुना लोड करा',
        exportBackup: 'बॅकअप ZIP डाउनलोड करा',
        restoreBackup: 'बॅकअप पुनर्संचयित करा',
        continue: 'पुढे जा',
        cancel: 'रद्द करा',
        save: 'बदल जतन करा',
        delete: 'हटवा',
        confirm: 'पुष्टी करा',
        close: 'बंद करा',
        skip: 'सध्या वगळा',
        backToLanding: 'मुख्य पृष्ठ',
      },
      dashboard: {
        title: 'शिक्षक कार्यक्षेत्र',
        subtitle: 'तुमची स्थानिक पाठ्यपुस्तके, प्रश्नपेढी आणि परीक्षा पत्रिका व्यवस्थापित करा.',
        continueDrafts: 'अलीकडील प्रश्नपत्रिका',
        noDraftsTitle: 'अद्याप कोणतीही प्रश्नपत्रिका नाही',
        noDraftsDesc:
          'सुरू करण्यासाठी CBSE इयत्ता 10 वी विज्ञान नमुना पॅक लोड करा किंवा तुमचे पाठ्यपुस्तक अपलोड करा.',
        quickActions: 'जलद कृती',
        storageHealth: 'स्थानिक संचयन आणि बॅकअप',
        librarySummary: 'ग्रंथालय सारांश',
      },
      settings: {
        title: 'कार्यक्षेत्र सेटिंग्ज',
        subtitle: 'शाळेची माहिती, स्थानिक बॅकअप, AI प्रदाता आणि भाषा निश्चित करा.',
        tabs: {
          profile: 'शाळा आणि प्रोफाइल',
          storage: 'संचयन आणि बॅकअप',
          ai: 'AI प्रदाता',
          appearance: 'दिसणे आणि भाषा',
          shortcuts: 'शॉर्टकट्स',
        },
      },
      onboarding: {
        title: 'EduPulse AI मध्ये आपले स्वागत आहे',
        subtitle: 'एका मिनिटापेक्षा कमी वेळेत तुमचे स्थानिक कार्यक्षेत्र सज्ज करा.',
        stepLanguage: 'भाषा आणि बोर्ड',
        stepStorage: 'स्थानिक फोल्डर सिंक',
        stepSample: 'प्रारंभिक ग्रंथालय',
      },
    },
  },
};

function getInitialLanguage(): string {
  try {
    const saved = localStorage.getItem('edupulse-lang');
    if (saved === 'en' || saved === 'hi' || saved === 'mr') return saved;
  } catch {
    // Ignore
  }
  return 'en';
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });
}

export function changeAppLanguage(lang: 'en' | 'hi' | 'mr'): void {
  try {
    localStorage.setItem('edupulse-lang', lang);
  } catch {
    // Ignore
  }
  void i18n.changeLanguage(lang);
}

export default i18n;
