import {
  QueryKeys,
  ContentTypes,
  EModelEndpoint,
  isAgentsEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type {
  Agent,
  TMessage,
  TFeedback,
  TConversation,
  EventSubmission,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import type { TFinalResData } from '~/common';
import { logger, getAllContentText, resolveAgentTarget } from '~/utils';

/**
 * Pendo Agent Analytics ids of the two server agents a chat request can reach. Every endpoint
 * except Assistants posts to `/api/agents/chat`, which `AgentClient`
 * (`api/server/controllers/agents/client.js`) answers; `assistants` posts to the v2 run
 * controller (`api/server/controllers/assistants/chatV2.js`).
 */
export const AGENT_IDS = {
  agents: 't97MDhqgcIfuJbv-AWVyWVV3NIY',
  assistants: 'VTKbzcYreG4bcVung9z_eJd1c6U',
} as const;

type AgentEvent = 'prompt' | 'agent_response' | 'user_reaction';

export type AgentReaction = 'positive' | 'negative' | 'mixed' | 'undo' | 'retry';

type AgentEventMetadata = {
  agentId: string;
  conversationId: string;
  messageId: string;
  /** The message text, or the reaction for `user_reaction`. */
  content: string;
  modelUsed?: string;
  suggestedPrompt?: boolean;
  toolsUsed?: string[];
  fileUploaded?: boolean;
};

declare global {
  interface Window {
    /** Pendo's web SDK; absent unless the deployment installs its snippet. */
    pendo?: {
      trackAgent?: (eventType: AgentEvent, metadata: AgentEventMetadata) => void;
    };
  }
}

type Endpoint = string | null | undefined;
type ToolCall = Extract<TMessageContentParts, { type: ContentTypes.TOOL_CALL }>['tool_call'];
type ReactionTarget = Pick<TMessage, 'messageId' | 'conversationId' | 'endpoint'>;
type ReactionConversation = Pick<TConversation, 'conversationId' | 'endpoint' | 'endpointType'>;

/** The conversation starter the user just picked, compared with the next prompt's text. */
let pendingStarter: string | undefined;

function send(eventType: AgentEvent, metadata: AgentEventMetadata): void {
  try {
    window.pendo?.trackAgent?.(eventType, metadata);
  } catch (error) {
    logger.warn('pendo', 'trackAgent failed', error);
  }
}

/** The agent that answers a request to `endpoint`; none for `azureAssistants`, whose v1
 *  controller is not instrumented. */
export function getAgentId(endpoint: Endpoint, endpointType?: Endpoint): string | undefined {
  if (!endpoint) {
    return undefined;
  }
  if (!isAssistantsEndpoint(endpoint)) {
    return AGENT_IDS.agents;
  }
  return (endpointType ?? endpoint) === EModelEndpoint.assistants
    ? AGENT_IDS.assistants
    : undefined;
}

function getToolName(toolCall: ToolCall): string | undefined {
  if ('function' in toolCall) {
    return toolCall.function.name;
  }
  if ('name' in toolCall) {
    return toolCall.name;
  }
  return toolCall.type;
}

function getToolsUsed(message: TMessage): string[] {
  const tools = new Set<string>();
  for (const part of message.content ?? []) {
    /** Interrupted streams can leave holes, and tool slots that never received a call. */
    if (part?.type !== ContentTypes.TOOL_CALL || part.tool_call == null) {
      continue;
    }
    const name = getToolName(part.tool_call);
    if (name) {
      tools.add(name);
    }
  }
  return [...tools];
}

/** Agent and Assistants replies carry their agent or assistant id in `model`, so their model
 *  comes from the agent record or the conversation instead. */
function getModelUsed(
  response: TMessage,
  submission: EventSubmission,
  queryClient: QueryClient,
): string | undefined {
  const { conversation } = submission;
  const endpoint = response.endpoint ?? conversation?.endpoint;
  if (isAssistantsEndpoint(endpoint)) {
    return conversation?.model || undefined;
  }
  if (!isAgentsEndpoint(endpoint)) {
    return response.model || conversation?.model || undefined;
  }
  const agentId = response.model || conversation?.agent_id;
  const agent = agentId ? queryClient.getQueryData<Agent>([QueryKeys.agent, agentId]) : undefined;
  return resolveAgentTarget(agentId, agent)?.model || undefined;
}

/** Flags the next prompt as suggested when it sends this conversation starter's text. */
export function markSuggestedPrompt(text: string): void {
  pendingStarter = text.trim();
}

/**
 * Reports a user turn once the server has saved it, so the ids are the ones the reply and any
 * reaction carry, including the conversation a first turn creates. Regenerate, continue,
 * edit-in-place and compaction replay an existing turn instead of sending one.
 */
export function trackAgentPrompt(submission: EventSubmission): void {
  const starter = pendingStarter;
  pendingStarter = undefined;
  const { userMessage, conversation, endpointOption, isRegenerate, isEdited, isContinued } =
    submission;
  if (isRegenerate || isEdited || isContinued || submission.compact) {
    return;
  }
  const agentId = getAgentId(
    endpointOption?.endpoint ?? conversation?.endpoint,
    endpointOption?.endpointType ?? conversation?.endpointType,
  );
  const { conversationId, messageId } = userMessage;
  if (agentId == null || !conversationId || !messageId) {
    return;
  }
  const content = userMessage.text ?? '';
  send('prompt', {
    agentId,
    conversationId,
    messageId,
    content,
    suggestedPrompt: starter != null && starter === content.trim(),
    fileUploaded: (userMessage.files?.length ?? 0) > 0,
  });
}

/**
 * Reports the reply a turn finished with, including one the user stopped. Assistants runs
 * stream their reply into the cache and finish without a `responseMessage`, so it is read from
 * `messages`. A compaction summarizes the branch instead of answering, and an error or an empty
 * reply has nothing to report.
 */
export function trackAgentResponse({
  data,
  messages,
  submission,
  queryClient,
}: {
  data: TFinalResData;
  messages?: TMessage[];
  submission: EventSubmission;
  queryClient: QueryClient;
}): void {
  if (submission.compact) {
    return;
  }
  const responseId = submission.initialResponse.messageId;
  const response =
    data.responseMessage ?? messages?.find((message) => message.messageId === responseId);
  if (response == null || response.error) {
    return;
  }
  const { conversation, endpointOption } = submission;
  const agentId = getAgentId(
    response.endpoint ?? endpointOption?.endpoint ?? conversation?.endpoint,
    endpointOption?.endpointType ?? conversation?.endpointType,
  );
  const conversationId = response.conversationId ?? data.conversation?.conversationId;
  const content = getAllContentText(response);
  const toolsUsed = getToolsUsed(response);
  if (agentId == null || !conversationId || !response.messageId) {
    return;
  }
  if (!content && toolsUsed.length === 0) {
    return;
  }
  send('agent_response', {
    agentId,
    conversationId,
    messageId: response.messageId,
    content,
    modelUsed: getModelUsed(response, submission, queryClient),
    toolsUsed,
  });
}

/** Reports a reaction to the agent reply `message`, attributed to the agent that wrote it. */
export function trackAgentReaction(
  message: ReactionTarget,
  conversation: ReactionConversation | null | undefined,
  reaction: AgentReaction,
): void {
  const agentId = getAgentId(
    message.endpoint ?? conversation?.endpoint,
    conversation?.endpointType,
  );
  const conversationId = message.conversationId ?? conversation?.conversationId;
  if (agentId == null || !conversationId || !message.messageId) {
    return;
  }
  send('user_reaction', {
    agentId,
    conversationId,
    messageId: message.messageId,
    content: reaction,
  });
}

/** Reports a rating given to a reply. Clearing it, or adding a note to the rating it already
 *  has, is not a new reaction. */
export function trackAgentFeedback(
  message: ReactionTarget | undefined,
  conversation: ReactionConversation | null | undefined,
  next: TFeedback | undefined,
  previous: TFeedback | undefined,
): void {
  if (message == null || next == null || next.rating === previous?.rating) {
    return;
  }
  trackAgentReaction(message, conversation, next.rating === 'thumbsUp' ? 'positive' : 'negative');
}
