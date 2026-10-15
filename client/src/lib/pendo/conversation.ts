import {
  QueryKeys,
  ContentTypes,
  isAgentsEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type {
  Agent,
  TMessage,
  TFeedbackRating,
  EventSubmission,
  TUpdateFeedbackResponse,
} from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import { logger, getAllContentText, resolveAgentTarget } from '~/utils';

/**
 * Pendo agent analytics (`pendo.trackAgent`) for the chat agent served by
 * `api/server/controllers/agents/client.js`, which answers every endpoint except the
 * Assistants API. Fork-owned: upstream files only call in here, each call marked `// FORK:`.
 *
 * Every tracker is a no-op until the Pendo agent has loaded `trackAgent`, and none of them
 * can throw into the chat flow that reports it.
 */

/** Pendo's id for this agent. */
const AGENT_ID = '23yvQ-ExgWf2K3vxzU9m0VqmtY4';

type AgentEvent = 'prompt' | 'agent_response' | 'user_reaction';

type AgentEventMetadata = {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message text, or the reaction for a `user_reaction`. */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
};

/** The one method of the Pendo agent this module calls, which exists once the agent has loaded. */
type PendoAgentAnalytics = {
  trackAgent?: (eventType: AgentEvent, metadata: AgentEventMetadata) => void;
};

/**
 * Read through a view of `window` rather than a `Window` declaration of its own: the Pendo
 * install owns the `window.pendo` global and its type, and this module needs only `trackAgent`.
 */
const getPendo = (): PendoAgentAnalytics | undefined =>
  (window as { pendo?: PendoAgentAnalytics }).pendo;

/** Text of the conversation starter just picked, held until the next prompt claims it. */
let suggestedPromptText: string | null = null;

const isPendoReady = (): boolean => typeof getPendo()?.trackAgent === 'function';

/** Analytics must never fail the chat action that reports it. */
function safely(track: () => void): void {
  try {
    track();
  } catch (error) {
    logger.debug('pendo', 'trackAgent failed', error);
  }
}

function report(eventType: AgentEvent, metadata: Omit<AgentEventMetadata, 'agentId'>): void {
  getPendo()?.trackAgent?.(eventType, { agentId: AGENT_ID, ...metadata });
}

/** An agents-endpoint response is stamped with the agent's id; the model is the agent's. */
function getModelUsed(message: TMessage, queryClient: QueryClient): string | undefined {
  const { model, endpoint } = message;
  if (!model) {
    return undefined;
  }
  if (!isAgentsEndpoint(endpoint)) {
    return model;
  }
  const agent = queryClient.getQueryData<Agent>([QueryKeys.agent, model]);
  return resolveAgentTarget(model, agent)?.model || undefined;
}

/** Distinct names of the tools the agent called while answering, in call order. */
function getToolsUsed(message: TMessage): string[] {
  const names = new Set<string>();
  for (const part of message.content ?? []) {
    if (part == null || part.type !== ContentTypes.TOOL_CALL) {
      continue;
    }
    const call = part[ContentTypes.TOOL_CALL];
    if (call != null && 'name' in call && call.name) {
      names.add(call.name);
    }
  }
  return Array.from(names);
}

/** Marks the conversation starter the user picked, so the prompt it sends reports as suggested. */
export function markSuggestedPrompt(text: string): void {
  safely(() => {
    suggestedPromptText = text.trim();
  });
}

/**
 * Reports the user's turn once the server has created it, so the first message of a new chat
 * carries the conversation id the agent saved it under rather than the client's placeholder.
 */
export function trackAgentPrompt(
  submission: Pick<EventSubmission, 'conversation' | 'userMessage' | 'isRegenerate' | 'isEdited'>,
): void {
  safely(() => {
    const { conversation, userMessage, isRegenerate, isEdited } = submission;
    /** Regenerates, continues, response edits and compactions replay a turn already sent. */
    if (!isPendoReady() || isRegenerate === true || isEdited === true) {
      return;
    }
    const { conversationId, messageId, text, files } = userMessage;
    const suggestedPrompt = suggestedPromptText === text.trim();
    suggestedPromptText = null;
    if (isAssistantsEndpoint(conversation?.endpoint) || !conversationId || !messageId) {
      return;
    }
    report('prompt', {
      conversationId,
      messageId,
      content: text,
      suggestedPrompt,
      fileUploaded: (files?.length ?? 0) > 0,
    });
  });
}

/** Reports a response the agent finished; stopped, cut-short and failed turns are not reported. */
export function trackAgentResponse(
  message: TMessage | null | undefined,
  queryClient: QueryClient,
): void {
  safely(() => {
    if (
      !isPendoReady() ||
      message == null ||
      message.unfinished === true ||
      message.error === true ||
      isAssistantsEndpoint(message.endpoint)
    ) {
      return;
    }
    const { conversationId, messageId } = message;
    if (!conversationId || !messageId) {
      return;
    }
    const modelUsed = getModelUsed(message, queryClient);
    report('agent_response', {
      conversationId,
      messageId,
      content: getAllContentText(message),
      toolsUsed: getToolsUsed(message),
      ...(modelUsed ? { modelUsed } : {}),
    });
  });
}

/**
 * Reports a thumbs rating once the server has saved it. Clearing a rating withdraws a reaction
 * rather than making one, and saving the same rating again (to add a note) refines the reaction
 * already reported, so neither is sent.
 */
export function trackAgentFeedback(
  saved: TUpdateFeedbackResponse,
  previousRating: TFeedbackRating | undefined,
  endpoint: string | null | undefined,
): void {
  safely(() => {
    const { conversationId, messageId, feedback } = saved;
    const rating = feedback?.rating;
    if (
      !isPendoReady() ||
      rating == null ||
      rating === previousRating ||
      isAssistantsEndpoint(endpoint) ||
      !conversationId ||
      !messageId
    ) {
      return;
    }
    report('user_reaction', {
      conversationId,
      messageId,
      content: rating === 'thumbsUp' ? 'positive' : 'negative',
    });
  });
}

/** Reports a regenerate as a `retry` reaction to the response it replaces. */
export function trackAgentRetry(message: TMessage): void {
  safely(() => {
    const { conversationId, messageId, endpoint } = message;
    if (!isPendoReady() || isAssistantsEndpoint(endpoint) || !conversationId || !messageId) {
      return;
    }
    report('user_reaction', { conversationId, messageId, content: 'retry' });
  });
}
