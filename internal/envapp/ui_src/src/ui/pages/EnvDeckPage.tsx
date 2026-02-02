import { DeckGrid, DeckTopBar, LoadingOverlay, useDeckDrag } from '@floegence/floe-webapp-core';
import { useProtocol } from '@floegence/floe-webapp-protocol';

export function EnvDeckPage() {
  const protocol = useProtocol();
  useDeckDrag();

  return (
    <div class="h-full min-h-0 flex flex-col">
      <DeckTopBar />

      <div class="flex-1 min-h-0 overflow-hidden relative">
        <DeckGrid class="p-0" />
        <LoadingOverlay visible={protocol.status() !== 'connected'} message="Connecting to agent..." />
      </div>
    </div>
  );
}
