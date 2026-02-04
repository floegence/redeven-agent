import { LoadingOverlay } from '@floegence/floe-webapp-core/loading';
import { useProtocol } from '@floegence/floe-webapp-protocol';
import { TerminalPanel } from '../widgets/TerminalPanel';

export function EnvTerminalPage() {
  const protocol = useProtocol();

  return (
    <div class="h-full min-h-0 overflow-hidden relative">
      <TerminalPanel variant="deck" />
      <LoadingOverlay visible={protocol.status() !== 'connected'} message="Connecting to agent..." />
    </div>
  );
}
