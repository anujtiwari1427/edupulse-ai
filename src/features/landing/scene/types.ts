export type BoardPreset = 'cbse-en' | 'msbshse-mr' | 'cbse-hi';

export type SetFocusMode = 'all' | 'A' | 'B' | 'C';

export type CameraPreset = 'hero' | 'exploded' | 'sets' | 'overhead';

export type StudioPartId = 'textbook' | 'blueprint' | 'sets' | 'seal' | 'rubric';

export interface StudioPartInfo {
  id: StudioPartId;
  title: string;
  detail: string;
}

export const STUDIO_PARTS: Record<StudioPartId, StudioPartInfo> = {
  textbook: {
    id: 'textbook',
    title: 'Source Textbook Stack',
    detail: 'PDF, DOCX & EPUB chapters indexed locally in IndexedDB with page citations.',
  },
  blueprint: {
    id: 'blueprint',
    title: 'Blueprint Matrix (80 Marks)',
    detail: 'Deterministic section totals, chapter weightage & internal choice rules.',
  },
  sets: {
    id: 'sets',
    title: 'Parallel Sets A · B · C',
    detail: 'Question & MCQ option shuffling with synchronized answer keys.',
  },
  seal: {
    id: 'seal',
    title: 'Local-First Examination Seal',
    detail: 'Zero cloud storage — originals and exports stay on your device.',
  },
  rubric: {
    id: 'rubric',
    title: 'Marking Scheme & Bloom Key',
    detail: 'Stepwise marking rubrics exported cleanly to print-ready PDF & DOCX.',
  },
};

export interface BoardMeta {
  id: BoardPreset;
  label: string;
  shortLabel: string;
  boardTitle: string;
  bookTitle: string;
  bookSubtitle: string;
  paperHeader: string;
  paperSub: string;
}

export const BOARD_META: Record<BoardPreset, BoardMeta> = {
  'cbse-en': {
    id: 'cbse-en',
    label: 'CBSE · English',
    shortLabel: 'CBSE (EN)',
    boardTitle: 'CBSE · CLASS X',
    bookTitle: 'SCIENCE',
    bookSubtitle: 'NCERT Pattern · Ch. 1–13',
    paperHeader: 'PRE-BOARD EXAMINATION · SCIENCE (086)',
    paperSub: 'Class X · Time: 3 Hours · Maximum Marks: 80',
  },
  'msbshse-mr': {
    id: 'msbshse-mr',
    label: 'Maharashtra · मराठी',
    shortLabel: 'MSBSHSE (मर)',
    boardTitle: 'महाराष्ट्र राज्य मंडळ · इयत्ता १० वी',
    bookTitle: 'विज्ञान व तंत्रज्ञान',
    bookSubtitle: 'भाग १ आणि २ · संपूर्ण अभ्यासक्रम',
    paperHeader: 'सराव परीक्षा · विज्ञान आणि तंत्रज्ञान (१)',
    paperSub: 'इयत्ता दहावी · वेळ: २ तास · एकूण गुण: ४०',
  },
  'cbse-hi': {
    id: 'cbse-hi',
    label: 'CBSE · हिन्दी',
    shortLabel: 'CBSE (हि)',
    boardTitle: 'केंद्रीय माध्यमिक शिक्षा बोर्ड · कक्षा १०',
    bookTitle: 'विज्ञान',
    bookSubtitle: 'एनसीईआरटी पाठ्यक्रम · अध्याय १–१३',
    paperHeader: 'प्री-बोर्ड परीक्षा · विज्ञान (०८६)',
    paperSub: 'कक्षा १० · समय: ३ घंटे · अधिकतम अंक: ८०',
  },
};
