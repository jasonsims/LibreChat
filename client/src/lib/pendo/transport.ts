import type { ChatEvent, ChatTransportOptions } from 'librechat-data-provider';
import type { Transport } from '~/hooks/Chat/contract';
import { trackReply, trackTurn } from './track';

/**
 * The conversation a start response admitted its turn into. The agents route keys a turn's
 * stream by its conversation id; a start that settled, or lost to a newer generation, admitted
 * nothing.
 */
function getAdmittedConversationId(response: unknown): string | null {
  if (response == null || typeof response !== 'object' || !('streamId' in response)) {
    return null;
  }
  if ('status' in response && (response.status === 'settled' || response.status === 'replaced')) {
    return null;
  }
  const { streamId } = response;
  return typeof streamId === 'string' && streamId !== '' ? streamId : null;
}

/** Reports a stream's FINAL frame, then hands every event on unchanged. */
const reportFinal =
  (onEvent: ChatTransportOptions['onEvent']) =>
  (event: ChatEvent): void => {
    if (event.type === 'final') {
      trackReply(event.data);
    }
    onEvent(event);
  };

/**
 * Reports the agents route's traffic to Pendo without changing it: each turn a start request
 * admits, and the reply each attached stream finishes with. `send` carries Assistants runs,
 * which the Assistants API serves rather than this agent, so it passes through untouched.
 */
export function withAgentTracking(transport: Transport): Transport {
  return {
    ...transport,
    start: async (request, options) => {
      const response = await transport.start(request, options);
      const conversationId = getAdmittedConversationId(response);
      if (conversationId != null) {
        trackTurn(request.payload, conversationId);
      }
      return response;
    },
    stream: (auth) => {
      const stream = transport.stream(auth);
      return {
        send: (request, options) => stream.send(request, options),
        reconnectToStream: (request, options) =>
          stream.reconnectToStream(request, { ...options, onEvent: reportFinal(options.onEvent) }),
      };
    },
  };
}
