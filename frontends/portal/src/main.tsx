import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './index.css';

import { AuthProvider, RequireAuth, useAuth } from './auth/auth';
import { ToastProvider } from './lib/toast';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { AuthCallback } from './pages/AuthCallback';

import { BeheerDashboard } from './features/beheer/BeheerDashboard';
import { KunstwerkenPage } from './features/beheer/KunstwerkenPage';
import { KunstwerkDetailPage } from './features/beheer/KunstwerkDetailPage';
import { BeoordelingenPage } from './features/beheer/BeoordelingenPage';

import { MonitoringDashboard } from './features/monitoring/MonitoringDashboard';
import { IncidentenPage } from './features/monitoring/IncidentenPage';
import { MetingenPage } from './features/monitoring/MetingenPage';
import { SessiesPage } from './features/monitoring/SessiesPage';
import { RapportenPage } from './features/monitoring/RapportenPage';

import { OnderhoudDashboard } from './features/onderhoud/OnderhoudDashboard';
import { StoringenPage } from './features/onderhoud/StoringenPage';
import { TrajectenPage } from './features/onderhoud/TrajectenPage';
import { TrajectDetailPage } from './features/onderhoud/TrajectDetailPage';

import { ContractDashboard } from './features/contract/ContractDashboard';
import { AanbestedingenPage } from './features/contract/AanbestedingenPage';
import { AanbestedingDetailPage } from './features/contract/AanbestedingDetailPage';
import { ContractenPage } from './features/contract/ContractenPage';
import { ContractDetailPage } from './features/contract/ContractDetailPage';

// Lijsten voelen live: elke 5 s verversen, en direct na elke mutatie (invalidate).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchInterval: 5000, retry: 1, refetchOnWindowFocus: false },
  },
});

// Na inloggen land je op het dashboard van je eigen bounded context.
function Start() {
  const { gebruiker } = useAuth();
  return <Navigate to={gebruiker ? `/${gebruiker.context}` : '/login'} replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
                <Route index element={<Start />} />

                <Route path="/beheer" element={<BeheerDashboard />} />
                <Route path="/beheer/kunstwerken" element={<KunstwerkenPage />} />
                <Route path="/beheer/kunstwerken/:id" element={<KunstwerkDetailPage />} />
                <Route path="/beheer/beoordelingen" element={<BeoordelingenPage />} />

                <Route path="/monitoring" element={<MonitoringDashboard />} />
                <Route path="/monitoring/incidenten" element={<IncidentenPage />} />
                <Route path="/monitoring/metingen" element={<MetingenPage />} />
                <Route path="/monitoring/sessies" element={<SessiesPage />} />
                <Route path="/monitoring/rapporten" element={<RapportenPage />} />

                <Route path="/onderhoud" element={<OnderhoudDashboard />} />
                <Route path="/onderhoud/storingen" element={<StoringenPage />} />
                <Route path="/onderhoud/trajecten" element={<TrajectenPage />} />
                <Route path="/onderhoud/trajecten/:id" element={<TrajectDetailPage />} />

                <Route path="/contract" element={<ContractDashboard />} />
                <Route path="/contract/aanbestedingen" element={<AanbestedingenPage />} />
                <Route path="/contract/aanbestedingen/:id" element={<AanbestedingDetailPage />} />
                <Route path="/contract/contracten" element={<ContractenPage />} />
                <Route path="/contract/contracten/:id" element={<ContractDetailPage />} />

                <Route path="*" element={<Start />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
