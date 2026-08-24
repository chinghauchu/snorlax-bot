/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly SNORLAX_URL?: string;
  readonly SNORLAX_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
