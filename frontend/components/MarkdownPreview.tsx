'use client';

import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked, type Token, type Tokens } from 'marked';
import MermaidPreview from '@/components/aa/studio/MermaidPreview';
import { sanitizeBody } from '@/lib/aa/flow-mermaid';

marked.setOptions({ breaks: true, gfm: true });

const MD_STYLES = `
.md-preview { font-size: 13px; line-height: 1.75; color: #9a98a8; }
.md-preview h1 { font-size: 20px; font-weight: 700; color: #e2e0db; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.07); }
.md-preview h2 { font-size: 16px; font-weight: 600; color: #c8c6c0; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); }
.md-preview h3 { font-size: 14px; font-weight: 600; color: #b0aebe; margin: 14px 0 6px; }
.md-preview h4 { font-size: 13px; font-weight: 600; color: #9a98a8; margin: 12px 0 4px; }
.md-preview p { margin: 6px 0; }
.md-preview a { color: #c8a96e; text-decoration: none; }
.md-preview a:hover { text-decoration: underline; }
.md-preview strong { color: #c8c6c0; font-weight: 600; }
.md-preview em { color: #b0aebe; font-style: italic; }
.md-preview ul, .md-preview ol { margin: 6px 0; padding-left: 20px; }
.md-preview li { margin: 3px 0; }
.md-preview li + li { margin-top: 2px; }
.md-preview code { font-family: "SF Mono","Fira Code",monospace; font-size: 11.5px; background: rgba(200,169,110,0.08); color: #c8a96e; padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(200,169,110,0.15); }
.md-preview pre { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 14px 16px; overflow-x: auto; margin: 10px 0; }
.md-preview pre code { background: none; border: none; padding: 0; color: #c8c6c0; font-size: 12px; }
.md-preview blockquote { border-left: 3px solid rgba(200,169,110,0.4); margin: 8px 0; padding: 6px 14px; background: rgba(200,169,110,0.04); border-radius: 0 6px 6px 0; color: #7a7888; }
.md-preview hr { border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 16px 0; }
.md-preview table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
.md-preview th { background: rgba(255,255,255,0.04); color: #c8c6c0; font-weight: 600; padding: 8px 12px; text-align: left; border: 1px solid rgba(255,255,255,0.08); }
.md-preview td { padding: 7px 12px; border: 1px solid rgba(255,255,255,0.06); color: #9a98a8; vertical-align: top; }
.md-preview tr:nth-child(even) td { background: rgba(255,255,255,0.015); }
`.trim();

interface Props {
  content: string;
  style?: React.CSSProperties;
  mermaid?: boolean;
}

type PreviewBlock = { html: string } | { diagram: string; original: string; error?: string };
const MERMAID_MAX_BYTES = 32768;

function previewBlocks(content: string, enabled: boolean): PreviewBlock[] {
  const tokens = marked.lexer(content);
  const blocks: PreviewBlock[] = [];
  let markdown: Token[] = [];
  function flush() {
    if (!markdown.length) return;
    const html = marked.parser(Object.assign(markdown, { links: tokens.links }));
    blocks.push({ html: DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) });
    markdown = [];
  }
  for (const token of tokens) {
    const code = token.type === 'code' ? token as Tokens.Code : null;
    if (!enabled || code?.lang?.trim().toLowerCase() !== 'mermaid') {
      markdown.push(token);
      continue;
    }
    flush();
    const original = code.text;
    if (new TextEncoder().encode(original).length > MERMAID_MAX_BYTES) {
      blocks.push({ diagram: '', original, error: 'Mermaid 블록은 32KB 이하여야 합니다.' });
    } else {
      blocks.push({ diagram: sanitizeBody(original).text, original });
    }
  }
  flush();
  return blocks;
}

export default function MarkdownPreview({ content, style, mermaid = true }: Props) {
  const [blocks, setBlocks] = useState<PreviewBlock[] | null>(null);

  useEffect(() => {
    try {
      setBlocks(previewBlocks(content, mermaid));
    } catch {
      setBlocks(null);
    }
  }, [content, mermaid]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MD_STYLES }} />
      {blocks === null ? (
        <div className="md-preview" style={style}><pre>{content}</pre></div>
      ) : (
        <div className="md-preview" style={style}>{blocks.map((block, index) => {
          if ('html' in block) return <div key={index} dangerouslySetInnerHTML={{ __html: block.html }} />;
          if (block.error) return <div key={index} role="alert"><div>{block.error}</div><pre>{block.original}</pre></div>;
          return <MermaidPreview key={index} source={block.diagram} fallbackSource={block.original} label="Mermaid 다이어그램" />;
        })}</div>
      )}
    </>
  );
}
