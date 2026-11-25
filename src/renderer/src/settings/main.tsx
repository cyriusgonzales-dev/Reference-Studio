import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startStores } from '../lib/stores';
import { SettingsApp } from './SettingsApp';
import '../styles.css';
import './settings.css';

void startStores();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>
);
