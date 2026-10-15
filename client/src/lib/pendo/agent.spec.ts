import { QueryClient } from '@tanstack/react-query';
import { ContentTypes, EModelEndpoint, QueryKeys } from 'librechat-data-provider';
import type { TMessage, EventSubmission } from 'librechat-data-provider';
import {
  AGENT_IDS,
  getAgentId,
  trackAgentPrompt,
  trackAgentFeedback,
  trackAgentReaction,
  trackAgentResponse,
  markSuggestedPrompt,
} from './agent';

const trackAgent = jest.fn();

const userMessage: TMessage = {
  messageId: 'user-1',
  conversationId: 'convo-1',
  parentMessageId: 'root',
  text: 'Summarize this',
  sender: 'User',
  isCreatedByUser: true,
};

const reply: TMessage = {
  messageId: 'reply-1',
  conversationId: 'convo-1',
  parentMessageId: 'user-1',
  text: '',
  sender: 'Claude',
  isCreatedByUser: false,
  endpoint: EModelEndpoint.anthropic,
  model: 'claude-haiku',
  content: [
    { type: ContentTypes.TEXT, text: 'Here is the summary.' },
    { type: ContentTypes.TOOL_CALL, tool_call: { id: 'call-1', name: 'web_search', args: '{}' } },
    { type: ContentTypes.TOOL_CALL, tool_call: { id: 'call-2', name: 'web_search', args: '{}' } },
  ],
};

const buildSubmission = (overrides: Partial<EventSubmission> = {}): EventSubmission => ({
  isTemporary: false,
  messages: [],
  endpointOption: { endpoint: EModelEndpoint.anthropic },
  conversation: { conversationId: 'convo-1', endpoint: EModelEndpoint.anthropic },
  userMessage,
  initialResponse: { ...reply, messageId: 'user-1_', content: [] },
  ...overrides,
});

beforeEach(() => {
  window.pendo = { trackAgent };
});

afterEach(() => {
  delete window.pendo;
});

describe('getAgentId', () => {
  it('attributes every endpoint but Assistants to the agents controller', () => {
    expect(getAgentId(EModelEndpoint.anthropic)).toBe(AGENT_IDS.agents);
    expect(getAgentId(EModelEndpoint.agents)).toBe(AGENT_IDS.agents);
    expect(getAgentId('OpenRouter', EModelEndpoint.custom)).toBe(AGENT_IDS.agents);
  });

  it('attributes Assistants v2 to its run controller and leaves v1 unattributed', () => {
    expect(getAgentId(EModelEndpoint.assistants)).toBe(AGENT_IDS.assistants);
    expect(getAgentId(EModelEndpoint.azureAssistants)).toBeUndefined();
    expect(getAgentId(null)).toBeUndefined();
  });
});

describe('trackAgentPrompt', () => {
  it('reports a saved user turn with its server ids', () => {
    trackAgentPrompt(
      buildSubmission({ userMessage: { ...userMessage, files: [{ file_id: 'file-1' }] } }),
    );

    expect(trackAgent).toHaveBeenCalledWith('prompt', {
      agentId: AGENT_IDS.agents,
      conversationId: 'convo-1',
      messageId: 'user-1',
      content: 'Summarize this',
      suggestedPrompt: false,
      fileUploaded: true,
    });
  });

  it('skips submissions that replay an existing turn', () => {
    trackAgentPrompt(buildSubmission({ isRegenerate: true }));
    trackAgentPrompt(buildSubmission({ isEdited: true }));
    trackAgentPrompt(buildSubmission({ isContinued: true }));
    trackAgentPrompt(buildSubmission({ compact: true }));

    expect(trackAgent).not.toHaveBeenCalled();
  });

  it('flags only the prompt a picked conversation starter sends', () => {
    markSuggestedPrompt(' Summarize this ');
    trackAgentPrompt(buildSubmission());
    trackAgentPrompt(buildSubmission({ userMessage: { ...userMessage, messageId: 'user-2' } }));

    expect(trackAgent).toHaveBeenNthCalledWith(
      1,
      'prompt',
      expect.objectContaining({ messageId: 'user-1', suggestedPrompt: true }),
    );
    expect(trackAgent).toHaveBeenNthCalledWith(
      2,
      'prompt',
      expect.objectContaining({ messageId: 'user-2', suggestedPrompt: false }),
    );
  });

  it('attributes an Assistants turn to the assistants agent', () => {
    trackAgentPrompt(
      buildSubmission({
        endpointOption: { endpoint: EModelEndpoint.assistants },
        conversation: { conversationId: 'convo-1', endpoint: EModelEndpoint.assistants },
      }),
    );

    expect(trackAgent).toHaveBeenCalledWith(
      'prompt',
      expect.objectContaining({ agentId: AGENT_IDS.assistants }),
    );
  });
});

describe('trackAgentResponse', () => {
  it('reports the reply text, its distinct tools and its model', () => {
    trackAgentResponse({
      data: { conversation: { conversationId: 'convo-1' }, responseMessage: reply },
      submission: buildSubmission(),
      queryClient: new QueryClient(),
    });

    expect(trackAgent).toHaveBeenCalledWith('agent_response', {
      agentId: AGENT_IDS.agents,
      conversationId: 'convo-1',
      messageId: 'reply-1',
      content: 'Here is the summary.',
      modelUsed: 'claude-haiku',
      toolsUsed: ['web_search'],
    });
  });

  it("reads an agent reply's model from the cached agent instead of its agent id", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([QueryKeys.agent, 'agent_1'], {
      provider: EModelEndpoint.anthropic,
      model: 'claude-sonnet',
    });

    trackAgentResponse({
      data: {
        conversation: { conversationId: 'convo-1' },
        responseMessage: { ...reply, endpoint: EModelEndpoint.agents, model: 'agent_1' },
      },
      submission: buildSubmission(),
      queryClient,
    });

    expect(trackAgent).toHaveBeenCalledWith(
      'agent_response',
      expect.objectContaining({ agentId: AGENT_IDS.agents, modelUsed: 'claude-sonnet' }),
    );
  });

  it('reads an Assistants reply, which the final frame omits, from the cache', () => {
    const streamed: TMessage = {
      ...reply,
      endpoint: EModelEndpoint.assistants,
      model: 'asst_1',
      content: [{ type: ContentTypes.TEXT, text: { value: 'From the thread.' } }],
    };

    trackAgentResponse({
      data: { conversation: { conversationId: 'convo-1' } },
      messages: [userMessage, streamed],
      submission: buildSubmission({
        endpointOption: { endpoint: EModelEndpoint.assistants },
        conversation: {
          conversationId: 'convo-1',
          endpoint: EModelEndpoint.assistants,
          model: 'gpt-4o',
        },
        initialResponse: { ...streamed, content: [] },
      }),
      queryClient: new QueryClient(),
    });

    expect(trackAgent).toHaveBeenCalledWith('agent_response', {
      agentId: AGENT_IDS.assistants,
      conversationId: 'convo-1',
      messageId: 'reply-1',
      content: 'From the thread.',
      modelUsed: 'gpt-4o',
      toolsUsed: [],
    });
  });

  it('skips compactions, errors and empty replies', () => {
    const queryClient = new QueryClient();
    const conversation = { conversationId: 'convo-1' };

    trackAgentResponse({
      data: { conversation, responseMessage: reply },
      submission: buildSubmission({ compact: true }),
      queryClient,
    });
    trackAgentResponse({
      data: { conversation, responseMessage: { ...reply, error: true } },
      submission: buildSubmission(),
      queryClient,
    });
    trackAgentResponse({
      data: { conversation, responseMessage: { ...reply, content: [] } },
      submission: buildSubmission(),
      queryClient,
    });

    expect(trackAgent).not.toHaveBeenCalled();
  });
});

describe('reactions', () => {
  it('reports a new rating and skips clearing or annotating one', () => {
    trackAgentFeedback(reply, null, { rating: 'thumbsUp', tag: undefined }, undefined);
    trackAgentFeedback(reply, null, { rating: 'thumbsDown', tag: undefined }, undefined);
    trackAgentFeedback(reply, null, undefined, { rating: 'thumbsUp', tag: undefined });
    trackAgentFeedback(
      reply,
      null,
      { rating: 'thumbsDown', tag: undefined, text: 'Missed the point' },
      { rating: 'thumbsDown', tag: undefined },
    );

    expect(trackAgent).toHaveBeenCalledTimes(2);
    expect(trackAgent).toHaveBeenNthCalledWith(
      1,
      'user_reaction',
      expect.objectContaining({ messageId: 'reply-1', content: 'positive' }),
    );
    expect(trackAgent).toHaveBeenNthCalledWith(
      2,
      'user_reaction',
      expect.objectContaining({ messageId: 'reply-1', content: 'negative' }),
    );
  });

  it('reports a retry against the reply it replaces', () => {
    trackAgentReaction(
      reply,
      { conversationId: 'convo-1', endpoint: EModelEndpoint.anthropic },
      'retry',
    );

    expect(trackAgent).toHaveBeenCalledWith('user_reaction', {
      agentId: AGENT_IDS.agents,
      conversationId: 'convo-1',
      messageId: 'reply-1',
      content: 'retry',
    });
  });

  it('never lets a missing or failing Pendo SDK reach the chat', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    delete window.pendo;
    expect(() => trackAgentReaction(reply, null, 'retry')).not.toThrow();

    window.pendo = {
      trackAgent: () => {
        throw new Error('pendo unavailable');
      },
    };
    expect(() => trackAgentReaction(reply, null, 'retry')).not.toThrow();
  });
});
