import { createContext, useContext } from 'solid-js';

import type { AgentMaintenanceController } from './createAgentMaintenanceController';
import type { AgentVersionModel } from './createAgentVersionModel';

export type AgentUpdateContextValue = Readonly<{
  version: AgentVersionModel;
  maintenance: AgentMaintenanceController;
}>;

export const AgentUpdateContext = createContext<AgentUpdateContextValue>();

export function useAgentUpdateContext(): AgentUpdateContextValue {
  const context = useContext(AgentUpdateContext);
  if (!context) {
    throw new Error('AgentUpdateContext is missing');
  }
  return context;
}
