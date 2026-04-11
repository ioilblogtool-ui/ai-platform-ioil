'use client';

import { useEffect, useState } from 'react';
import { marked } from 'marked';

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
}

export default function MarkdownPreview({ content, style }: Props) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    try {
      setHtml(marked.parse(content) as string);
    } catch {
      setHtml(`<pre>${content}</pre>`);
    }
  }, [content]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MD_STYLES }} />
      <div
        className="md-preview"
        style={style}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
