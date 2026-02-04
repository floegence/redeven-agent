import { LoadingOverlay } from '@floegence/floe-webapp-core/loading';
import { useProtocol } from '@floegence/floe-webapp-protocol';
import { AgentMonitorPanel } from '../widgets/AgentMonitorPanel';

export function EnvMonitorPage() {
  const protocol = useProtocol();

  return (
    <div class="h-full min-h-0 overflow-hidden relative">
      <AgentMonitorPanel variant="page" />
      <LoadingOverlay visible={protocol.status() !== 'connected'} message="Connecting to agent..." />
    </div>
  );
}
