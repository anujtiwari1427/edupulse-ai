import JSZip from 'jszip';
import type { ExtractedPage } from './types';

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripXhtmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(withoutScripts)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function resolveRelativePath(baseDir: string, href: string): string {
  const cleanHref = href.split('#')[0] ?? href;
  if (!baseDir) return cleanHref;
  const parts = `${baseDir}/${cleanHref}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

export async function extractEpubPages(buffer: ArrayBuffer): Promise<ExtractedPage[]> {
  const zip = await JSZip.loadAsync(buffer);

  let opfPath = '';
  const containerEntry = zip.file('META-INF/container.xml');
  if (containerEntry) {
    const containerXml = await containerEntry.async('text');
    const match = containerXml.match(/full-path=["']([^"']+)["']/i);
    if (match?.[1]) opfPath = match[1];
  }

  if (!opfPath) {
    const opfCandidate = Object.keys(zip.files).find((k) => k.toLowerCase().endsWith('.opf'));
    if (opfCandidate) opfPath = opfCandidate;
  }

  const orderedPaths: string[] = [];
  if (opfPath && zip.file(opfPath)) {
    const opfXml = await zip.file(opfPath)!.async('text');
    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';

    const idToHref = new Map<string, string>();
    const itemRegex = /<item\b([^>]+)>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(opfXml)) !== null) {
      const attrs = m[1] ?? '';
      const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
      const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
      const typeMatch = attrs.match(/\bmedia-type=["']([^"']+)["']/i);
      if (idMatch?.[1] && hrefMatch?.[1]) {
        const mediaType = typeMatch?.[1] ?? '';
        if (!mediaType || mediaType.includes('html') || mediaType.includes('xml')) {
          idToHref.set(idMatch[1], resolveRelativePath(opfDir, decodeURIComponent(hrefMatch[1])));
        }
      }
    }

    const spineRegex = /<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/gi;
    while ((m = spineRegex.exec(opfXml)) !== null) {
      const href = m[1] ? idToHref.get(m[1]) : undefined;
      if (href) orderedPaths.push(href);
    }
  }

  if (orderedPaths.length === 0) {
    const htmlFiles = Object.keys(zip.files)
      .filter((name) => /\.(xhtml|html|htm)$/i.test(name) && !zip.files[name]?.dir)
      .sort();
    orderedPaths.push(...htmlFiles);
  }

  const pages: ExtractedPage[] = [];
  let pageNumber = 1;
  for (const filePath of orderedPaths) {
    const entry = zip.file(filePath);
    if (!entry) continue;
    const rawHtml = await entry.async('text');
    const text = stripXhtmlToText(rawHtml);
    if (text.length > 0) {
      pages.push({ pageNumber, text });
      pageNumber += 1;
    }
  }

  return pages;
}
