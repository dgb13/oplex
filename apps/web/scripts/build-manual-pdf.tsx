/**
 * Arma el manual resumido en PDF (apps/web/public/ayuda/manual-oplex.pdf) a
 * partir de los mismos archivos que la sección /documentacion:
 *   - Introducción: el capítulo 0 completo.
 *   - Contenido: una página de resumen por capítulo (_resumen.md) y el
 *     capítulo de Conexión con ARCA completo, porque es lo que más se consulta.
 *   - Resumen: el recorrido completo y el glosario.
 *
 * Correr después de cambiar el manual:  npx nx run web:manual-pdf
 * (o directamente: npx tsx apps/web/scripts/build-manual-pdf.tsx)
 */
import { Document, Font, Image, Link, Page, renderToFile, StyleSheet, Text, View } from '@react-pdf/renderer';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
// tsx compila JSX con React.createElement (runtime clásico).
import React, { type ReactNode } from 'react';
import { DOCS_CHAPTERS, type DocsChapter } from '../src/lib/docs-manifest';

const ROOT = process.cwd();
const WEB = existsSync(join(ROOT, 'apps', 'web')) ? join(ROOT, 'apps', 'web') : ROOT;
const CONTENT = join(WEB, 'ayuda');
const PUBLIC = join(WEB, 'public');
const OUT = join(PUBLIC, 'ayuda', 'manual-oplex.pdf');
const SITE = 'https://oplex.com.ar';
const VERSION = 'Versión 1.0 · octubre de 2026';

// Tipografías de @fontsource (las mismas de los PDF de la app).
const resolveFont = createRequire(join(ROOT, 'package.json')).resolve;
const font = (pkg: string, name: string) => resolveFont(`@fontsource/${pkg}/files/${name}.woff`);
Font.register({
  family: 'Geist',
  fonts: [
    { src: font('geist', 'geist-latin-400-normal'), fontWeight: 400 },
    { src: font('geist', 'geist-latin-600-normal'), fontWeight: 600 },
    { src: font('geist', 'geist-latin-700-normal'), fontWeight: 700 },
  ],
});
Font.register({ family: 'GeistMono', src: font('geist-mono', 'geist-mono-latin-400-normal') });
Font.registerHyphenationCallback((word) => [word]);

const INK = '#17181c';
const MUTED = '#666b78';
const INDIGO = '#4f39f6';
const ORANGE = '#f97316';
const LINE = '#e4e5ea';

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 50, fontFamily: 'Geist', fontSize: 10, color: INK },
  footer: { position: 'absolute', bottom: 24, left: 50, right: 50, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
  partTitle: { fontSize: 9, color: INDIGO, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  chapterTitle: { fontSize: 20, fontWeight: 700, marginBottom: 6 },
  chapterLead: { fontSize: 10.5, color: MUTED, marginBottom: 14 },
  articleTitle: { fontSize: 14, fontWeight: 700, marginTop: 14, marginBottom: 6, color: INDIGO },
  h2: { fontSize: 12, fontWeight: 700, marginTop: 10, marginBottom: 4 },
  h3: { fontSize: 10.5, fontWeight: 700, marginTop: 8, marginBottom: 3 },
  p: { marginBottom: 6 },
  bold: { fontWeight: 600 },
  code: { fontFamily: 'GeistMono', fontSize: 8.5, color: '#3a3d46' },
  link: { color: INDIGO, textDecoration: 'none' },
  listItem: { flexDirection: 'row', marginBottom: 4 },
  bullet: { width: 14, color: MUTED },
  stepNumber: { width: 16, height: 16, borderRadius: 8, backgroundColor: INDIGO, color: '#ffffff', fontSize: 8, fontWeight: 700, textAlign: 'center', paddingTop: 3, marginRight: 7 },
  callout: { borderRadius: 6, paddingVertical: 6, paddingHorizontal: 9, marginBottom: 8 },
  calloutLabel: { fontSize: 7, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  figure: { marginVertical: 6, borderWidth: 0.7, borderColor: LINE, borderRadius: 6, overflow: 'hidden' },
  caption: { fontSize: 8, color: MUTED, paddingVertical: 4, paddingHorizontal: 7, borderTopWidth: 0.7, borderTopColor: LINE },
  table: { borderWidth: 0.7, borderColor: LINE, borderRadius: 5, marginBottom: 8 },
  tr: { flexDirection: 'row', borderTopWidth: 0.7, borderTopColor: LINE },
  th: { flex: 1, padding: 5, fontSize: 8, fontWeight: 700, color: MUTED, backgroundColor: '#f4f5f7' },
  td: { flex: 1, padding: 5, fontSize: 8.5 },
  tocRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: LINE },
});

const CALLOUT_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  NOTA: { label: 'Nota', bg: '#ecebff', color: INDIGO },
  IMPORTANTE: { label: 'Importante', bg: '#fdf2df', color: '#b45309' },
  ERROR: { label: 'Error', bg: '#fde8e8', color: '#b91c1c' },
};

interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  url?: string;
  alt?: string;
  children?: MdNode[];
}

function read(relative: string): string | null {
  const path = join(CONTENT, relative);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function parse(raw: string): { meta: Record<string, string>; tree: MdNode } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  const meta: Record<string, string> = {};
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const body = match ? raw.slice(match[0].length) : raw;
  return { meta, tree: fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as MdNode };
}

function plain(node: MdNode): string {
  if (node.value !== undefined) return node.value;
  return (node.children ?? []).map(plain).join('');
}

// Caracteres que Geist no trae (en la web se ven, en el PDF saldrían como
// basura): los números en círculo de las capturas, tildes y flechas.
function pdfText(text: string): string {
  return text
    .replace(/[①-⑨]/g, (c) => `(${c.charCodeAt(0) - 0x245f})`)
    .replace(/[→⟶]/g, '›')
    .replace(/\s?⚠\s?/g, ' · ')
    .replace(/−/g, '-')
    .replace(/⋯/g, '...')
    .replace(/●/g, '•')
    .replace(/[✓✔✕✖⟳✎✨]\s?|[\u{1F300}-\u{1FAFF}]\s?/gu, '');
}

function inline(nodes: MdNode[] = [], key = ''): ReactNode[] {
  return nodes.map((node, i) => {
    const k = `${key}${i}`;
    switch (node.type) {
      case 'text':
        return pdfText(node.value ?? '');
      case 'strong':
        return (
          <Text key={k} style={s.bold}>
            {inline(node.children, k)}
          </Text>
        );
      case 'emphasis':
        return <Text key={k}>{inline(node.children, k)}</Text>;
      case 'inlineCode':
        return (
          <Text key={k} style={s.code}>
            {node.value}
          </Text>
        );
      case 'link': {
        const url = node.url?.startsWith('/') ? `${SITE}${node.url}` : node.url;
        return (
          <Link key={k} src={url ?? ''} style={s.link}>
            {inline(node.children, k)}
          </Link>
        );
      }
      case 'break':
        return '\n';
      default:
        return plain(node);
    }
  });
}

function image(node: MdNode, key: string): ReactNode {
  const url = node.url ?? '';
  const path = url.startsWith('/') ? join(PUBLIC, url) : null;
  if (!path || !existsSync(path)) return null;
  return (
    <View key={key} style={s.figure} wrap={false}>
      {/* Como buffer: una ruta de Windows (C:\...) la toma como URL y la intenta bajar. */}
      <Image src={{ data: readFileSync(path), format: path.endsWith('.png') ? 'png' : 'jpg' }} style={{ width: '100%' }} />
      {node.alt ? <Text style={s.caption}>{node.alt}</Text> : null}
    </View>
  );
}

function block(node: MdNode, key: string, inStep = false): ReactNode {
  switch (node.type) {
    case 'heading':
      return (
        <Text key={key} style={node.depth === 2 ? s.h2 : s.h3} minPresenceAhead={40}>
          {inline(node.children, key)}
        </Text>
      );
    case 'paragraph': {
      const kids = node.children ?? [];
      if (kids.length === 1 && kids[0].type === 'image') return image(kids[0], key);
      return (
        <Text key={key} style={s.p}>
          {inline(kids, key)}
        </Text>
      );
    }
    case 'list':
      return (
        <View key={key} style={{ marginBottom: 6 }}>
          {(node.children ?? []).map((item, i) => (
            <View key={`${key}-${i}`} style={s.listItem} minPresenceAhead={30}>
              {node.ordered && !inStep ? (
                <Text style={s.stepNumber}>{i + 1}</Text>
              ) : (
                <Text style={s.bullet}>{node.ordered ? `${i + 1}.` : '•'}</Text>
              )}
              <View style={{ flex: 1 }}>{(item.children ?? []).map((child, j) => block(child, `${key}-${i}-${j}`, node.ordered))}</View>
            </View>
          ))}
        </View>
      );
    case 'blockquote': {
      const first = plain(node.children?.[0] ?? { type: 'text', value: '' }).trim();
      const mark = /^\[!(NOTA|IMPORTANTE|ERROR)\]/.exec(first);
      const style = CALLOUT_STYLE[mark?.[1] ?? 'NOTA'];
      const children = (node.children ?? []).map((child, i) => {
        if (i === 0 && mark && child.children?.[0]?.type === 'text') {
          const rest = { ...child, children: [{ ...child.children[0], value: (child.children[0].value ?? '').replace(/^\[![A-Z]+\]\s*/, '') }, ...child.children.slice(1)] };
          return block(rest, `${key}-${i}`);
        }
        return block(child, `${key}-${i}`);
      });
      return (
        <View key={key} style={[s.callout, { backgroundColor: style.bg }]} wrap={false}>
          <Text style={[s.calloutLabel, { color: style.color }]}>{style.label}</Text>
          {children}
        </View>
      );
    }
    case 'table': {
      const [head, ...rows] = node.children ?? [];
      return (
        <View key={key} style={s.table}>
          <View style={{ flexDirection: 'row' }}>
            {(head?.children ?? []).map((cell, i) => (
              <Text key={i} style={s.th}>
                {inline(cell.children, `${key}h${i}`)}
              </Text>
            ))}
          </View>
          {rows.map((row, r) => (
            <View key={r} style={s.tr} wrap={false}>
              {(row.children ?? []).map((cell, i) => (
                <Text key={i} style={s.td}>
                  {inline(cell.children, `${key}r${r}c${i}`)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    }
    case 'thematicBreak':
      return <View key={key} style={{ borderTopWidth: 0.7, borderTopColor: LINE, marginVertical: 8 }} />;
    case 'code':
      return (
        <Text key={key} style={[s.code, s.p]}>
          {node.value}
        </Text>
      );
    default:
      return null;
  }
}

function markdown(tree: MdNode, key: string): ReactNode[] {
  return (tree.children ?? []).map((node, i) => block(node, `${key}-${i}`));
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>Manual de Oplex · {VERSION}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function ChapterHeader({ part, chapter }: { part: string; chapter: DocsChapter }) {
  return (
    <View>
      <Text style={s.partTitle}>{part}</Text>
      <Text style={s.chapterTitle}>
        {chapter.number}. {chapter.title}
      </Text>
      <Text style={s.chapterLead}>{chapter.description}</Text>
    </View>
  );
}

function fullChapter(part: string, chapter: DocsChapter) {
  return (
    <Page key={chapter.slug} size="A4" style={s.page}>
      <ChapterHeader part={part} chapter={chapter} />
      {chapter.articles.map((slug) => {
        const raw = read(join(chapter.slug, `${slug}.md`));
        if (!raw) return null;
        const { meta, tree } = parse(raw);
        return (
          <View key={slug}>
            <Text style={s.articleTitle} minPresenceAhead={60}>
              {meta['title'] ?? slug}
            </Text>
            {markdown(tree, slug)}
          </View>
        );
      })}
      <Footer />
    </Page>
  );
}

function summaryChapter(chapter: DocsChapter) {
  const raw = read(join(chapter.slug, '_resumen.md'));
  return (
    <Page key={chapter.slug} size="A4" style={s.page}>
      <ChapterHeader part="Contenido" chapter={chapter} />
      {raw ? markdown(parse(raw).tree, chapter.slug) : null}
      <Text style={[s.p, { color: MUTED, marginTop: 8 }]}>
        Paso a paso completo, con capturas: <Link src={`${SITE}/documentacion/${chapter.slug}`} style={s.link}>{`${SITE.replace('https://', '')}/documentacion/${chapter.slug}`}</Link>
      </Text>
      <Footer />
    </Page>
  );
}

const byNumber = (n: number) => DOCS_CHAPTERS.find((c) => c.number === n) as DocsChapter;
const intro = byNumber(0);
const arca = byNumber(2);
const glossary = byNumber(12);
const middle = DOCS_CHAPTERS.filter((c) => c.number >= 1 && c.number <= 11);

const manual = (
  <Document title="Manual de usuario de Oplex" author="Oplex" language="es-AR">
    <Page size="A4" style={[s.page, { backgroundColor: '#101116', color: '#ffffff', justifyContent: 'space-between' }]}>
      <Text style={{ fontSize: 26, fontWeight: 700 }}>
        oplex<Text style={{ color: ORANGE }}>.</Text>
      </Text>
      <View>
        <Text style={{ fontSize: 30, fontWeight: 700, marginBottom: 8 }}>Manual de usuario</Text>
        <Text style={{ fontSize: 12, color: '#c9cbd3' }}>Versión resumida para imprimir o compartir</Text>
        <Text style={{ fontSize: 10, color: '#9a9eab', marginTop: 4 }}>{VERSION}</Text>
      </View>
      <Text style={{ fontSize: 9, color: '#9a9eab' }}>
        Manual completo, con buscador y todas las capturas: {SITE.replace('https://', '')}/documentacion
      </Text>
    </Page>

    <Page size="A4" style={s.page}>
      <Text style={s.chapterTitle}>Contenido</Text>
      <Text style={s.chapterLead}>
        Introducción, un resumen de cada módulo con sus tareas principales, la Conexión con ARCA completa y, al final, el
        resumen del recorrido y el glosario.
      </Text>
      {DOCS_CHAPTERS.map((c) => (
        <View key={c.slug} style={s.tocRow}>
          <Text>
            <Text style={s.bold}>{c.number}. </Text>
            {c.title}
            {c === arca ? ' (completo)' : ''}
          </Text>
          <Text style={{ color: MUTED }}>{c.description.length > 70 ? `${c.description.slice(0, 68)}…` : c.description}</Text>
        </View>
      ))}
      <Footer />
    </Page>

    {fullChapter('Introducción', intro)}
    {middle.map((chapter) => (chapter === arca ? fullChapter('Contenido', chapter) : summaryChapter(chapter)))}
    {fullChapter('Resumen', glossary)}
  </Document>
);

renderToFile(manual, OUT).then(
  () => console.log(`Manual generado: ${OUT}`),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
