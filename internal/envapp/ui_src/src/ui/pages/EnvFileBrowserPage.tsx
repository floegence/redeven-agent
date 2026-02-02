import { LoadingOverlay } from '@floegence/floe-webapp-core';
import { useProtocol } from '@floegence/floe-webapp-protocol';
import { RemoteFileBrowser } from '../widgets/RemoteFileBrowser';

export function EnvFileBrowserPage() {
  const protocol = useProtocol();

  return (
    <div class="h-full min-h-0 overflow-hidden relative">
      <RemoteFileBrowser />
      <LoadingOverlay visible={protocol.status() !== 'connected'} message="Connecting to agent..." />
    </div>
  );
}
