import { useState } from 'react';
import { HealthBar } from './components/HealthBar';
import { ContextMap } from './components/ContextMap';
import { DemoScript } from './components/DemoScript';
import { BeheerPanel, ContractPanel, MonitoringPanel, OnderhoudPanel } from './components/panels';
import { ToastProvider } from './lib/toast';

export default function App() {
  const [arrows, setArrows] = useState<string[]>([]);

  return (
    <ToastProvider>
      <div className="app">
        <header className="app__header">
          <div className="app__brand">
            <span className="app__logo">RWS</span>
            <div>
              <h1>DDD Regiekamer</h1>
              <p>Live demo — vier bounded contexts, events via RabbitMQ</p>
            </div>
          </div>
          <HealthBar />
        </header>

        <div className="app__top">
          <div className="app__demo">
            <h2 className="section-title">Demo-script</h2>
            <DemoScript onArrows={setArrows} />
          </div>
          <div className="app__map">
            <h2 className="section-title">Context-map</h2>
            <ContextMap active={new Set(arrows)} />
            <a className="rabbit-link" href="http://localhost:15672" target="_blank" rel="noreferrer">
              ↗ RabbitMQ-management (rws / rws)
            </a>
          </div>
        </div>

        <main className="app__panels">
          <BeheerPanel />
          <MonitoringPanel />
          <OnderhoudPanel />
          <ContractPanel />
        </main>

        <footer className="app__footer">
          Alle data is <strong>live</strong> uit de services — geen mocks. Poll-interval 2 s.
        </footer>
      </div>
    </ToastProvider>
  );
}
