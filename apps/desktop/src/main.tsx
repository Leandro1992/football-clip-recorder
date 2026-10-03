import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { createHttpApi } from './http-api';
import './styles.css';

// Electron injects window.desktopApi via preload; in a plain browser we talk to the Node server over HTTP.
if (!window.desktopApi) {
  window.desktopApi = createHttpApi();
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
