import type { ReactNode } from 'react';

export interface AppShellProps {
  title: string;
  tagline: string;
  howTo: readonly string[];
  children: ReactNode;
  /** Replaces the default privacy line, e.g. for the one tool that can make an opt-in network call. */
  privacy?: string;
}

export function AppShell({ title, tagline, howTo, children, privacy }: AppShellProps) {
  return (
    <div className="shell">
      <header className="shell-header">
        <a className="back" href="../">
          ← All tools
        </a>
        <h1>{title}</h1>
        <p className="tagline">{tagline}</p>
        <span className="privacy">
          {privacy ?? 'Runs entirely in your browser. Your files are never uploaded, and nothing is tracked.'}
        </span>
      </header>
      <details className="howto" open>
        <summary>How to use</summary>
        <ol>
          {howTo.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
      <main>{children}</main>
    </div>
  );
}
