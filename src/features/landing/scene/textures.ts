import * as THREE from 'three';
import { BOARD_META, type BoardPreset } from './types';

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context for procedural texture');
  }
  return [canvas, ctx];
}

function finalizeColorTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeat = false
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

export function createMicroGrainDataTexture(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  let seed = 1337;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(195 + nextRand() * 55);
    const idx = i * 4;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.needsUpdate = true;
  return tex;
}

export function createDeskMatTexture(isDark: boolean, anisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);

  ctx.fillStyle = isDark ? '#141925' : '#262d3d';
  ctx.fillRect(0, 0, size, size);

  // Subtle radial vignette
  const grad = ctx.createRadialGradient(size / 2, size / 2, 120, size / 2, size / 2, 540);
  grad.addColorStop(0, isDark ? 'rgba(99, 102, 241, 0.10)' : 'rgba(99, 102, 241, 0.08)');
  grad.addColorStop(1, 'rgba(8, 10, 16, 0.30)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Drafting grid lines
  const step = 32;
  ctx.lineWidth = 1;
  for (let i = 0; i <= size; i += step) {
    const isMajor = i % (step * 4) === 0;
    ctx.strokeStyle = isMajor ? 'rgba(165, 180, 252, 0.16)' : 'rgba(148, 163, 184, 0.06)';
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Border rule & corner ticks
  ctx.strokeStyle = 'rgba(165, 180, 252, 0.34)';
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, size - 56, size - 56);

  ctx.fillStyle = 'rgba(199, 210, 254, 0.56)';
  ctx.font = '600 16px "JetBrains Mono", monospace';
  ctx.fillText('EDUPULSE STUDIO · A4 / ISO-216', 44, size - 42);
  ctx.textAlign = 'right';
  ctx.fillText('LOCAL INDEXEDDB · OFFLINE READY', size - 44, size - 42);

  return finalizeColorTexture(canvas, anisotropy);
}

export function createBookCoverTexture(
  board: BoardPreset,
  variant: 'primary' | 'companion',
  anisotropy: number
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(768, 1024);
  const meta = BOARD_META[board];

  const bgTop = variant === 'primary' ? '#312e81' : '#1e293b';
  const bgBottom = variant === 'primary' ? '#1e1b4b' : '#0f172a';
  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, bgTop);
  grad.addColorStop(1, bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 768, 1024);

  // Subtle linen cross-hatch texture
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 1024; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(768, y);
    ctx.stroke();
  }
  for (let x = 0; x < 768; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }

  // Spine crease strip on left
  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.fillRect(0, 0, 44, 1024);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
  ctx.fillRect(44, 0, 4, 1024);

  // Gold foil geometric frame
  const accent = variant === 'primary' ? '#f59e0b' : '#818cf8';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(72, 60, 636, 904);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(86, 74, 608, 876);

  // Header band
  ctx.fillStyle = accent;
  ctx.fillRect(112, 118, 556, 6);

  ctx.fillStyle = '#fef3c7';
  ctx.font = '700 26px "Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    variant === 'primary' ? meta.boardTitle : 'QUESTION BANK · ARCHIVE',
    112,
    172
  );

  // Main book title
  ctx.fillStyle = '#ffffff';
  ctx.font =
    board === 'cbse-en'
      ? '800 72px "Plus Jakarta Sans", sans-serif'
      : '700 58px "Noto Sans Devanagari", "Plus Jakarta Sans", sans-serif';
  ctx.fillText(variant === 'primary' ? meta.bookTitle : 'MATHEMATICS', 112, 310);

  ctx.fillStyle = '#c7d2fe';
  ctx.font = '500 28px "Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif';
  ctx.fillText(
    variant === 'primary' ? meta.bookSubtitle : 'Standard & Basic · Ch. 1–14',
    112,
    366
  );

  // Clean geometric botanical / molecular diagram motif
  const cx = 390;
  const cy = 600;
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * Math.PI) / 3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 145, 52, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fill();

  // Footer foil stamp
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.font = '600 22px "JetBrains Mono", monospace';
  ctx.fillText('EDITION 2025 · INDEXED PAGE REFS', 112, 888);
  ctx.fillStyle = accent;
  ctx.fillRect(112, 912, 220, 4);

  return finalizeColorTexture(canvas, anisotropy);
}

export function createPageEdgesTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#f5f1e6';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 3) {
    const shade = y % 6 === 0 ? 'rgba(120, 113, 108, 0.16)' : 'rgba(255, 255, 255, 0.35)';
    ctx.fillStyle = shade;
    ctx.fillRect(0, y, 256, 1.5);
  }
  return finalizeColorTexture(canvas, anisotropy);
}

export function createBlueprintPlateTexture(
  board: BoardPreset,
  isDark: boolean,
  anisotropy: number
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(1024, 680);

  ctx.fillStyle = isDark ? '#0f172a' : '#f8faff';
  ctx.fillRect(0, 0, 1024, 680);

  // Blueprint grid
  ctx.strokeStyle = isDark ? 'rgba(129, 140, 248, 0.16)' : 'rgba(67, 56, 202, 0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 1024; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 680);
    ctx.stroke();
  }
  for (let y = 0; y <= 680; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  // Outer frame
  ctx.strokeStyle = isDark ? '#818cf8' : '#4338ca';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, 976, 632);

  // Header
  ctx.fillStyle = isDark ? '#e0e7ff' : '#1e1b4b';
  ctx.font = '700 32px "Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif';
  ctx.fillText(
    board === 'msbshse-mr'
      ? 'BLUEPRINT MATRIX · इयत्ता १० वी (४० गुण)'
      : board === 'cbse-hi'
        ? 'BLUEPRINT MATRIX · कक्षा १० विज्ञान (८० अंक)'
        : 'VALIDATED BLUEPRINT MATRIX · 80 MARKS',
    56,
    84
  );

  ctx.fillStyle = isDark ? '#a5b4fc' : '#4338ca';
  ctx.font = '600 20px "JetBrains Mono", monospace';
  ctx.fillText('DETERMINISTIC SECTION MATH · CHOICE VALIDATED · ZERO GAPS', 56, 120);

  // Table header
  const rows: ReadonlyArray<readonly [string, string, string, string]> = [
    ['Section A', 'Objective MCQ & A/R', '20 × 1m', '20'],
    ['Section B', 'Very Short Answer', '06 × 2m', '12'],
    ['Section C', 'Short Answer (OR)', '07 × 3m', '21'],
    ['Section D', 'Long Answer', '03 × 5m', '15'],
    ['Section E', 'Case Study', '03 × 4m', '12'],
  ];

  ctx.fillStyle = isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(67, 56, 202, 0.12)';
  ctx.fillRect(56, 152, 912, 52);

  ctx.fillStyle = isDark ? '#c7d2fe' : '#312e81';
  ctx.font = '700 21px "JetBrains Mono", monospace';
  ctx.fillText('SECTION', 76, 186);
  ctx.fillText('QUESTION TYPE', 250, 186);
  ctx.fillText('RULE', 640, 186);
  ctx.textAlign = 'right';
  ctx.fillText('MARKS', 944, 186);
  ctx.textAlign = 'left';

  rows.forEach(([sec, qType, rule, marks], idx) => {
    const y = 248 + idx * 68;
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(67, 56, 202, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(56, y + 20);
    ctx.lineTo(968, y + 20);
    ctx.stroke();

    ctx.fillStyle = isDark ? '#f8fafc' : '#1c1917';
    ctx.font = '700 23px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(sec, 76, y);

    ctx.fillStyle = isDark ? '#cbd5e1' : '#44403c';
    ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(qType, 250, y);

    ctx.font = '600 21px "JetBrains Mono", monospace';
    ctx.fillText(rule, 640, y);

    ctx.fillStyle = isDark ? '#fbbf24' : '#4338ca';
    ctx.textAlign = 'right';
    ctx.fillText(marks, 944, y);
    ctx.textAlign = 'left';
  });

  // Footer total bar
  ctx.fillStyle = isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(67, 56, 202, 0.10)';
  ctx.fillRect(56, 562, 912, 62);
  ctx.fillStyle = isDark ? '#fde68a' : '#1e1b4b';
  ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('TOTAL VERIFIED QUESTIONS: 39', 76, 601);
  ctx.textAlign = 'right';
  ctx.font = '700 26px "JetBrains Mono", monospace';
  ctx.fillText('80 / 80 MARKS OK', 944, 601);
  ctx.textAlign = 'left';

  return finalizeColorTexture(canvas, anisotropy);
}

export function createExamPaperTexture(
  setCode: 'A' | 'B' | 'C',
  board: BoardPreset,
  anisotropy: number
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(768, 1080);
  const meta = BOARD_META[board];

  // Crisp ivory-white A4 stock
  ctx.fillStyle = '#fcfbf8';
  ctx.fillRect(0, 0, 768, 1080);

  // Subtle top/bottom margin marks
  ctx.strokeStyle = '#d6d3d1';
  ctx.lineWidth = 2;
  ctx.strokeRect(32, 32, 704, 1016);

  // Header block
  ctx.fillStyle = '#1c1917';
  ctx.font = '700 24px "Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(meta.paperHeader, 384, 88);

  ctx.fillStyle = '#57534e';
  ctx.font = '500 18px "Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif';
  ctx.fillText(meta.paperSub, 384, 118);

  // Set stamp badge (stamped print box)
  ctx.strokeStyle = setCode === 'A' ? '#4338ca' : setCode === 'B' ? '#b45309' : '#047857';
  ctx.lineWidth = 3;
  ctx.strokeRect(584, 138, 128, 44);
  ctx.fillStyle = setCode === 'A' ? '#4338ca' : setCode === 'B' ? '#b45309' : '#047857';
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillText(`SET ${setCode}`, 648, 168);

  // Roll No box
  ctx.textAlign = 'left';
  ctx.strokeStyle = '#78716c';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(54, 142, 230, 38);
  ctx.fillStyle = '#44403c';
  ctx.font = '600 17px "JetBrains Mono", monospace';
  ctx.fillText('Roll No: [ _ _ _ _ _ ]', 68, 167);

  // Divider
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(54, 202);
  ctx.lineTo(714, 202);
  ctx.stroke();

  if (board === 'msbshse-mr') {
    ctx.fillStyle = '#1c1917';
    ctx.font = '700 22px "Noto Sans Devanagari", sans-serif';
    ctx.fillText('विभाग अ — बहुपर्यायी प्रश्न (प्रत्येकी १ गुण)', 54, 246);

    const mrQuestions =
      setCode === 'B'
        ? [
            'प्र. १. संतुलित रासायनिक समीकरणात अणूंची संख्या ____ असते.',
            '  (अ) कमी    (ब) समान    (क) जास्त    (ड) बदलती',
            'प्र. २. आधुनिक आवर्तसारणीत किती आवर्त असतात?',
            '  (अ) ५      (ब) ६       (क) ७       (ड) १८',
            'प्र. ३. भिंगाचे नाभीय अंतर मीटरमध्ये असल्यास शक्तीचे एकक कोणते?',
            '  (अ) वॅट     (ब) डायऑप्टर  (क) ज्यूल     (ड) न्यूटन',
          ]
        : [
            'प्र. १ (अ) योग्य पर्याय निवडून विधाने पूर्ण करा. [५ गुण]',
            '  १. तांबे व जस्त यांच्या संमिश्राला ____ म्हणतात.',
            '     (अ) पोलाद   (ब) पितळ    (क) कांस्य   (ड) जर्मन सिल्व्हर',
            '  २. अंतर्गोल आरशासमोर वस्तू मुख्य नाभीवर ठेवल्यास प्रतिमा ____',
            '     (अ) अनंत अंतरावर   (ब) ध्रुवावर   (क) नाभीवर',
            'प्र. २. शास्त्रीय कारणे लिहा (कोणतेही दोन) [४ गुण]',
          ];

    ctx.font = '500 20px "Noto Sans Devanagari", sans-serif';
    ctx.fillStyle = '#292524';
    mrQuestions.forEach((line, i) => {
      ctx.fillText(line, 54, 300 + i * 48);
    });
  } else if (board === 'cbse-hi') {
    ctx.fillStyle = '#1c1917';
    ctx.font = '700 22px "Noto Sans Devanagari", sans-serif';
    ctx.fillText('खंड अ — वस्तुनिष्ठ प्रश्न (प्रत्येक १ अंक)', 54, 246);

    const hiLines = [
      'प्र. १. जब तनु HCl की अभिक्रिया दानेदार जिंक से होती है, तो कौन सी गैस निकलती है?',
      '  (क) ऑक्सीजन   (ख) हाइड्रोजन   (ग) क्लोरीन   (घ) नाइट्रोजन',
      'प्र. २. फेरस सल्फेट क्रिस्टल के ऊष्मीय अपघटन का संतुलित समीकरण लिखिए। [2]',
      '  स्रोत: एनसीईआरटी विज्ञान अध्याय १ · पृष्ठ ५',
      'प्र. ३. शुष्क HCl गैस शुष्क लिटमस पत्र का रंग क्यों नहीं बदलती? [2]',
      '  अंक योजना: H+ आयन अनुपस्थिति (1m) + जलीय माध्यम आवश्यक (1m)',
    ];
    ctx.font = '500 19px "Noto Sans Devanagari", sans-serif';
    ctx.fillStyle = '#292524';
    hiLines.forEach((line, i) => {
      ctx.fillText(line, 54, 300 + i * 50);
    });
  } else {
    ctx.fillStyle = '#1c1917';
    ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('SECTION A — Objective Questions (1 Mark each)', 54, 246);

    const qList =
      setCode === 'A'
        ? [
            {
              q: 'Q1. Which gas is evolved when dilute HCl reacts with zinc granules?',
              opts: '(a) Oxygen   (b) Hydrogen   (c) Carbon dioxide   (d) Chlorine',
              marks: '[1]',
            },
            {
              q: 'Q2. Thermal decomposition of ferrous sulphate crystals yields:',
              opts: '(a) Fe2O3 + SO2 + SO3   (b) FeO + SO2   (c) FeSO3 + O2',
              marks: '[1]',
            },
            {
              q: 'Q21. Why does dry HCl gas not change the colour of dry litmus?',
              opts: 'Source: NCERT Class 10 Science · Ch. 2 · Page 23',
              marks: '[2]',
            },
            {
              q: 'Q27. Draw labelled ray diagram for convex lens at 2F1.',
              opts: 'OR: Explain power of accommodation of the human eye.',
              marks: '[3]',
            },
          ]
        : setCode === 'B'
          ? [
              {
                q: 'Q1. Thermal decomposition of ferrous sulphate crystals yields:',
                opts: '(a) FeSO3 + O2   (b) FeO + SO2   (c) Fe2O3 + SO2 + SO3',
                marks: '[1]',
              },
              {
                q: 'Q2. Which gas is evolved when dilute HCl reacts with zinc granules?',
                opts: '(a) Chlorine   (b) Carbon dioxide   (c) Hydrogen   (d) Oxygen',
                marks: '[1]',
              },
              {
                q: 'Q21. State Ohm’s law and sketch its V-I graph.',
                opts: 'Source: NCERT Class 10 Science · Ch. 11 · Page 176',
                marks: '[2]',
              },
              {
                q: 'Q27. Explain why dry HCl gas does not turn dry blue litmus red.',
                opts: 'Answer Key synced to Set B · Q1:(c), Q2:(c)',
                marks: '[3]',
              },
            ]
          : [
              {
                q: 'Q1. Which element exhibits maximum catenation in organic compounds?',
                opts: '(a) Silicon   (b) Carbon   (c) Sulphur   (d) Phosphorus',
                marks: '[1]',
              },
              {
                q: 'Q2. Which gas is evolved when dilute HCl reacts with zinc granules?',
                opts: '(a) Hydrogen   (b) Oxygen   (c) Nitrogen   (d) Chlorine',
                marks: '[1]',
              },
              {
                q: 'Q21. Define esterification with a balanced chemical equation.',
                opts: 'Source: NCERT Class 10 Science · Ch. 4 · Page 73',
                marks: '[2]',
              },
              {
                q: 'Q27. Describe the role of stomata and guard cells in transpiration.',
                opts: 'Answer Key synced to Set C · Q1:(b), Q2:(a)',
                marks: '[3]',
              },
            ];

    let y = 298;
    qList.forEach((item) => {
      ctx.fillStyle = '#1c1917';
      ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(item.q, 54, y);
      ctx.textAlign = 'right';
      ctx.font = '700 18px "JetBrains Mono", monospace';
      ctx.fillText(item.marks, 714, y);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#57534e';
      ctx.font = '500 16px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(item.opts, 72, y + 32);

      y += 96;
      ctx.strokeStyle = '#e7e5e4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(54, y - 22);
      ctx.lineTo(714, y - 22);
      ctx.stroke();
    });
  }

  // Simulated ruled lines for bottom half of exam sheet
  ctx.fillStyle = '#a8a29e';
  ctx.font = '600 16px "JetBrains Mono", monospace';
  ctx.fillText(`SECTION D & E CONTINUE OVERLEAF · GENERATED BY EDUPULSE LOCAL ENGINE`, 54, 726);
  for (let i = 0; i < 7; i++) {
    const lineY = 768 + i * 32;
    ctx.fillStyle = i % 3 === 0 ? '#d6d3d1' : '#e7e5e4';
    ctx.fillRect(54, lineY, i === 6 ? 420 : 660, 8);
  }

  // Bottom verification footer
  ctx.fillStyle = '#4338ca';
  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillText(`SET-${setCode} · MARKING SCHEME SYNCED · 80 MARKS VERIFIED`, 54, 1020);

  return finalizeColorTexture(canvas, anisotropy);
}

export function createRubricCardTexture(isDark: boolean, anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(640, 440);

  ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
  ctx.fillRect(0, 0, 640, 440);

  ctx.strokeStyle = isDark ? '#475569' : '#d6d3d1';
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, 616, 416);

  ctx.fillStyle = '#4338ca';
  ctx.fillRect(12, 12, 616, 56);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('ANSWER KEY & BLOOM RUBRIC', 36, 48);

  const items: ReadonlyArray<readonly [string, string, string]> = [
    ['Q1', '(b) Hydrogen · Zn + 2HCl -> ZnCl2 + H2', 'Remember'],
    ['Q2', '(a) Fe2O3 + SO2 + SO3 · Endothermic', 'Understand'],
    ['Q21', '1m dry HCl check + 1m aqueous H3O+', 'Analyze'],
    ['Q27', '1.5m ray focus + 1.5m image nature', 'Apply'],
  ];

  items.forEach(([q, ans, bloom], i) => {
    const y = 114 + i * 74;
    ctx.fillStyle = isDark ? '#fbbf24' : '#4338ca';
    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.fillText(q, 36, y);

    ctx.fillStyle = isDark ? '#f1f5f9' : '#1c1917';
    ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(ans, 96, y);

    ctx.fillStyle = isDark ? '#94a3b8' : '#78716c';
    ctx.font = '500 16px "JetBrains Mono", monospace';
    ctx.fillText(`Bloom: ${bloom} · Stepwise Verified`, 96, y + 26);
  });

  return finalizeColorTexture(canvas, anisotropy);
}
