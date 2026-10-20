import { Fragment } from 'react';
import { safeChatHref } from '../../shared/mobile-domain/chat-rendering';
import styles from './ai-assistant-drawer.module.css';

function inline(value: string) {
  return value.split(/(\*\*[^*]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\))/gu).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={index}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
    const href = link && safeChatHref(link[2]);
    if (link && href)
      return (
        <a
          key={index}
          href={href}
          target={href.startsWith('/') ? undefined : '_blank'}
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          {link[1]}
        </a>
      );
    return <Fragment key={index}>{part}</Fragment>;
  });
}
export function AssistantMessage({ content }: { content: string }) {
  // Fenced code is text, including HTML. There is no markdown HTML/image loader.
  const parts = content.split(/(```[^\n]*\n[\s\S]*?(?:```|$))/gu);
  return (
    <div className={styles.messageBody}>
      {parts.map((part, partIndex) => {
        if (part.startsWith('```')) {
          const newline = part.indexOf('\n');
          return (
            <pre key={partIndex}>
              <code>{part.slice(newline + 1).replace(/```$/u, '')}</code>
            </pre>
          );
        }
        return part
          .split(/\n\s*\n/gu)
          .filter(Boolean)
          .map((block, blockIndex) => {
            const lines = block.split('\n').filter(Boolean);
            const key = `${partIndex}:${blockIndex}`;
            if (lines.every((line) => /^\s*[-*] /u.test(line)))
              return (
                <ul key={key}>
                  {lines.map((line, index) => (
                    <li key={index}>{inline(line.replace(/^\s*[-*]\s*/u, ''))}</li>
                  ))}
                </ul>
              );
            if (lines.every((line) => /^\s*\d+[.)] /u.test(line)))
              return (
                <ol key={key} start={Number.parseInt(lines[0].trim(), 10)}>
                  {lines.map((line, index) => (
                    <li key={index}>{inline(line.replace(/^\s*\d+[.)]\s*/u, ''))}</li>
                  ))}
                </ol>
              );
            return (
              <p key={key}>
                {lines.map((line, index) => (
                  <Fragment key={index}>
                    {inline(line)}
                    {index < lines.length - 1 && <br />}
                  </Fragment>
                ))}
              </p>
            );
          });
      })}
    </div>
  );
}
