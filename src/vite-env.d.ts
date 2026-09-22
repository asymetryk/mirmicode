/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKING_SET_URL?: string;
  /** Bake public/read-only BIP; scrub agent prompts unless full live is set. */
  readonly VITE_PUBLIC_MODE?: string;
  /** Explicit override: keep prompts even when VITE_PUBLIC_MODE is on. */
  readonly VITE_PUBLIC_FULL_LIVE?: string;
  /**
   * Selects the data source at startup.
   *   "native"   — load mirmicode-native feed fixture, no cahq calls
   *   undefined  — default to the existing working-set / fixture flow
   */
  readonly VITE_FEED_SOURCE?: string;
}
