import { useMemo } from 'react';
import { renderMarkdown } from '../lib/markdown';

// Renders AI text (headings, lists, bold, quotes and real tables). Styled by .md in index.css.
export default function Markdown({ content, className = '' }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
