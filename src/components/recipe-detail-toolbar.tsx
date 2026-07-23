'use client';

import {
  Braces,
  ChefHat,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  FileText,
  Printer,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { DismissibleDetails } from '@/components/dismissible-details';
import { InlineSkeleton } from '@/components/skeleton';
import { useToast } from '@/components/toast-provider';

type ExportFormat = 'JSON-LD' | 'Markdown';

async function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Clipboard permissions vary on local-network and embedded browsers.
      // Fall through to the selection-based copy path.
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  textArea.remove();
  if (!copied) throw new Error('The browser did not allow clipboard access.');
}

export function RecipeDetailToolbar({ recipeId }: { recipeId: string }) {
  const { showToast } = useToast();
  const [copying, setCopying] = useState<ExportFormat | null>(null);

  async function copyExport(format: ExportFormat, route: string, menu: HTMLDetailsElement | null) {
    setCopying(format);
    try {
      const response = await fetch(route);
      if (!response.ok) throw new Error(`The ${format} export could not be prepared.`);
      await writeClipboard(await response.text());
      showToast(`${format} copied to the clipboard.`, 'success');
      if (menu) menu.open = false;
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : `The ${format} export could not be copied.`,
        'error',
      );
    } finally {
      setCopying(null);
    }
  }

  const jsonLdRoute = `/api/v1/recipes/${recipeId}/export`;
  const markdownRoute = `/api/v1/recipes/${recipeId}/export/markdown`;

  return (
    <div className="recipe-detail-toolbar" role="toolbar" aria-label="Recipe actions">
      <Link className="recipe-toolbar-primary" href={`/recipes/${recipeId}/cook`}>
        <ChefHat size={18} aria-hidden="true" />
        Cook this recipe
      </Link>
      <Link className="recipe-toolbar-button" href={`/recipes/${recipeId}/edit`}>
        <Edit3 size={17} aria-hidden="true" />
        Edit recipe
      </Link>
      <button className="recipe-toolbar-button" type="button" onClick={() => window.print()}>
        <Printer size={17} aria-hidden="true" />
        Print recipe card
      </button>
      <DismissibleDetails
        className="recipe-export-menu"
        summary={
          <>
            <Download size={17} aria-hidden="true" />
            Export
            <ChevronDown className="recipe-export-chevron" size={16} aria-hidden="true" />
          </>
        }
        summaryAriaLabel="Export recipe options"
      >
        <div className="recipe-export-popover">
          <section aria-labelledby="jsonld-export-heading">
            <p id="jsonld-export-heading">
              <Braces size={15} aria-hidden="true" /> JSON-LD
            </p>
            <a href={jsonLdRoute} download data-menu-close>
              <Download size={16} aria-hidden="true" /> Download JSON-LD
            </a>
            <button
              type="button"
              onClick={(event) =>
                copyExport('JSON-LD', jsonLdRoute, event.currentTarget.closest('details'))
              }
              disabled={copying !== null}
              aria-busy={copying === 'JSON-LD'}
            >
              {copying === 'JSON-LD' ? (
                <InlineSkeleton label="Preparing JSON-LD" width="1rem" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
              Copy JSON-LD
            </button>
          </section>
          <section aria-labelledby="markdown-export-heading">
            <p id="markdown-export-heading">
              <FileText size={15} aria-hidden="true" /> Markdown
            </p>
            <a href={markdownRoute} download data-menu-close>
              <Download size={16} aria-hidden="true" /> Download Markdown
            </a>
            <button
              type="button"
              onClick={(event) =>
                copyExport('Markdown', markdownRoute, event.currentTarget.closest('details'))
              }
              disabled={copying !== null}
              aria-busy={copying === 'Markdown'}
            >
              {copying === 'Markdown' ? (
                <InlineSkeleton label="Preparing Markdown" width="1rem" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
              Copy Markdown
            </button>
          </section>
        </div>
      </DismissibleDetails>
    </div>
  );
}
