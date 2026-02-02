import { createContext, useContext, type Resource } from 'solid-js';
import type { EnvironmentDetail } from '../services/controlplaneApi';

export type EnvContextValue = {
  env_id: () => string;
  env: Resource<EnvironmentDetail | null>;
  connect: () => Promise<void>;
  connecting: () => boolean;
  connectError: () => string | null;
};

export const EnvContext = createContext<EnvContextValue>();

export function useEnvContext(): EnvContextValue {
  const ctx = useContext(EnvContext);
  if (!ctx) {
    throw new Error('EnvContext is missing');
  }
  return ctx;
}
