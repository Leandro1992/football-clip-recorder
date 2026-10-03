/// <reference types="vite/client" />

import type { DesktopApi } from '../electron/ipc-types';

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}

export {};
