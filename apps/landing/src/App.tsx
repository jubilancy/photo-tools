import { TOOLS } from '@tools/registry';
import '@tools/ui/styles.css';
import './landing.css';

const GROUPS = ['Images', 'Media', 'Time', 'Data'] as const;

export function App() {
  return (
    <div className="shell">
      <header className="shell-header">
        <h1>Browser Tools</h1>
        <p className="tagline">Small single-purpose utilities. Every file is processed on your device.</p>
        <span className="privacy">No uploads, no accounts, no analytics.</span>
      </header>
      <main>
        {GROUPS.map((group) => (
          <section key={group} aria-labelledby={`g-${group}`}>
            <h2 id={`g-${group}`}>{group}</h2>
            <ul className="tool-grid">
              {TOOLS.filter((t) => t.group === group).map((tool) => (
                <li key={tool.slug}>
                  <a className="tool-card" href={`./${tool.slug}/`}>
                    <strong>{tool.name}</strong>
                    <span className="muted small">{tool.summary}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
