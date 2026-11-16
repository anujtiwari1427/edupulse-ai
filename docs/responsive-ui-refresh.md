# EduPulse AI Responsive UI Refresh

## Understanding summary

- Refresh both the public landing page and teacher workspace for phones and tablets.
- Deliver a polished, professional visual experience while keeping all existing features usable.
- Preserve current workflows, local-first data handling, optional BYOK AI, and offline/PWA behavior.
- Keep EduPulse AI a web app; do not introduce accounts, a backend, or unrelated product features.
- Use a cohesive refresh rather than isolated fixes or a complete redesign.

## Assumptions and constraints

- Avoid materially worsening mobile responsiveness or initial page loading.
- Retain the current single-browser/local-storage model and existing privacy guarantees.
- Preserve offline reliability and supported browser behavior.
- Prefer existing React, Tailwind, theme variables, and UI primitives; avoid unnecessary dependencies.
- No specific screens, minimum browser versions, or numeric performance thresholds were supplied.

## Final design

### Visual direction

Use a polished academic-studio aesthetic with clear typography, deliberate hierarchy, consistent spacing, and restrained indigo/emerald accents. Apply glassmorphism selectively to layered navigation, hero overlays, and a few emphasized panels. Keep reading, editing, and dense form surfaces predominantly opaque for legibility and performance. Respect light/dark themes, contrast, and reduced-motion preferences.

### Responsive structure

- **Phones:** Single-column layouts, existing bottom navigation and drawer, safe-area spacing, and comfortable touch targets. Keep every workspace destination and action reachable.
- **Tablets:** Compact navigation rail/header to protect the content area from a full desktop sidebar.
- **Larger screens:** Retain the existing sidebar and wide layouts.
- **Landing page:** Keep primary actions visible, intentionally stack hero content and the 3D stage, and adapt stage controls without removing interactions.
- **Workspace:** Keep generation steps clear and linear. Preserve the paper editor's edit/preview switcher while improving touch access to key actions.

### Applying the refresh

Treat the workspace as a working tool: reduce decorative noise, strengthen page and section hierarchy, and make the next useful action clear. Make dashboard actions and local storage/backup status scannable. Standardize card density, filters, empty states, and action placement across Library, Templates, and Saved Papers. Make generation progress and validation easy to scan. Prioritize readable question content and access to edit, preview, undo, save, and export in the paper editor.

Use consistent visual rules for loading, empty, warning, success, and error states. Preserve existing labels, workflows, and translations. Do not apply translucent surfaces to long-form question content or dense forms.

## Validation and success criteria

Check representative widths of 360, 390, 768, 1024, and 1440 CSS pixels. Core pages should have no unintended horizontal scrolling; navigation and existing actions should remain reachable; touch targets and text should be comfortable to use; and layouts should work in English, Hindi, and Marathi.

Validate light/dark themes, keyboard focus, contrast, reduced motion, safe areas, and touch interaction with the 3D hero. Recheck navigation, paper generation, saved-paper editing and preview, autosave/undo, exports, offline/PWA behavior, and local persistence. Use existing typecheck, lint, build, Vitest, and Playwright checks, adding focused responsive assertions for changed behavior. Avoid materially increasing initial page payload.

Key risks to test directly: translated-label overflow, dense editor controls, translucent-surface contrast, and constrained mobile rendering.

## Decision log

| Decision | Alternatives considered | Rationale |
| --- | --- | --- |
| Refresh both landing and workspace for phones and tablets while preserving all current capabilities. | Landing-only, workspace-only, or simplifying mobile feature coverage. | The requested scope is the whole site and the mobile experience should remain full-featured. |
| Use a cohesive responsive UI refresh. | Targeted fixes or a complete redesign. | A shared visual treatment offers better polish than scattered patches without the regression risk of a full rewrite. |
| Use glassmorphism selectively. | Apply glass broadly or avoid it entirely. | It supports the requested polished style while keeping dense content readable and performant. |
| Reuse existing React/Tailwind components and theme variables. | Add a new component system or dependencies. | This minimizes maintenance and avoids unnecessary architecture changes. |
| Keep local-first privacy, offline/PWA support, and core workflows unchanged. | Add backend/account requirements or alter product behavior. | These are existing product guarantees and explicit constraints for this refresh. |
