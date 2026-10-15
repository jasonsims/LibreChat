import { QueryClient } from '@tanstack/react-query';
import { QueryKeys, ContentTypes, EModelEndpoint } from 'librechat-data-provider';
import type { Agent, TMessage } from 'librechat-data-provider';
import {
  trackAgentRetry,
  trackAgentPrompt,
  trackAgentFeedback,
  trackAgentResponse,
  markSuggestedPrompt,
} from './conversation';

const AGENT_ID = '23yvQ-ExgWf2K3vxzU9m0VqmtY4';

/** The agent the Pendo install defines on `window`, reduced to what these tests stub. */
const pendoWindow = window as { pendo?: { trackAgent?: jest.Mock } };

type PromptTurn = Parameters<typeof trackAgentPrompt>[0];

const createTurn = (
  turn: Partial<PromptTurn> = {},
  message: Partial<TMessage> = {},
): PromptTurn => ({
  conversation: { conversationId: 'convo-1', endpoint: EModelEndpoint.anthropic },
  userMessage: {
    messageId: 'user-1',
    conversationId: 'convo-1',
    parentMessageId: null,
    isCreatedByUser: true,
    text: 'What changed in the last release?',
    ...message,
  },
  ...turn,
});

const createResponse = (message: Partial<TMessage> = {}): TMessage => ({
  messageId: 'response-1',
  conversationId: 'convo-1',
  parentMessageId: 'user-1',
  isCreatedByUser: false,
  endpoint: EModelEndpoint.anthropic,
  model: 'claude-haiku-5-5',
  text: '',
  content: [{ type: ContentTypes.TEXT, text: 'The release added tool approvals.' }],
  ...message,
});

describe('Pendo agent tracking', () => {
  let trackAgent: jest.Mock;
  let queryClient: QueryClient;

  beforeEach(() => {
    trackAgent = jest.fn();
    pendoWindow.pendo = { trackAgent };
    queryClient = new QueryClient();
  });

  afterEach(() => {
    delete pendoWindow.pendo;
  });

  describe('trackAgentPrompt', () => {
    it('reports the turn under the ids the server created it with', () => {
      trackAgentPrompt(createTurn());

      expect(trackAgent).toHaveBeenCalledTimes(1);
      expect(trackAgent).toHaveBeenCalledWith('prompt', {
        agentId: AGENT_ID,
        conversationId: 'convo-1',
        messageId: 'user-1',
        content: 'What changed in the last release?',
        suggestedPrompt: false,
        fileUploaded: false,
      });
    });

    it('reports attached files', () => {
      trackAgentPrompt(createTurn({}, { files: [{ file_id: 'file-1' }] }));

      expect(trackAgent).toHaveBeenCalledWith(
        'prompt',
        expect.objectContaining({ fileUploaded: true }),
      );
    });

    it('flags a picked conversation starter on the prompt it sends only', () => {
      markSuggestedPrompt('  Summarize the release  ');
      trackAgentPrompt(createTurn({}, { text: 'Summarize the release' }));
      trackAgentPrompt(createTurn({}, { messageId: 'user-2', text: 'Summarize the release' }));

      expect(trackAgent.mock.calls.map(([, metadata]) => metadata.suggestedPrompt)).toEqual([
        true,
        false,
      ]);
    });

    it('skips turns that replay one the user already sent', () => {
      trackAgentPrompt(createTurn({ isRegenerate: true }));
      trackAgentPrompt(createTurn({ isEdited: true }));

      expect(trackAgent).not.toHaveBeenCalled();
    });

    it('skips Assistants conversations, which a different controller serves', () => {
      trackAgentPrompt(createTurn({ conversation: { endpoint: EModelEndpoint.assistants } }));

      expect(trackAgent).not.toHaveBeenCalled();
    });
  });

  describe('trackAgentResponse', () => {
    it('reports a finished response with its text, distinct tools and model', () => {
      trackAgentResponse(
        createResponse({
          content: [
            { type: ContentTypes.TOOL_CALL, tool_call: { id: 'call-1', name: 'web_search' } },
            { type: ContentTypes.TOOL_CALL, tool_call: { id: 'call-2', name: 'web_search' } },
            { type: ContentTypes.TOOL_CALL, tool_call: { id: 'call-3', name: 'execute_code' } },
            { type: ContentTypes.TEXT, text: 'The release added tool approvals.' },
          ],
        }),
        queryClient,
      );

      expect(trackAgent).toHaveBeenCalledWith('agent_response', {
        agentId: AGENT_ID,
        conversationId: 'convo-1',
        messageId: 'response-1',
        content: 'The release added tool approvals.',
        modelUsed: 'claude-haiku-5-5',
        toolsUsed: ['web_search', 'execute_code'],
      });
    });

    it('reports the model behind a saved agent rather than its id', () => {
      queryClient.setQueryData([QueryKeys.agent, 'agent_release'], {
        id: 'agent_release',
        provider: EModelEndpoint.anthropic,
        model: 'claude-haiku-5-5',
      } as Agent);

      trackAgentResponse(
        createResponse({ endpoint: EModelEndpoint.agents, model: 'agent_release' }),
        queryClient,
      );

      expect(trackAgent).toHaveBeenCalledWith(
        'agent_response',
        expect.objectContaining({ modelUsed: 'claude-haiku-5-5' }),
      );
    });

    it('leaves the model out while a saved agent has not loaded', () => {
      trackAgentResponse(
        createResponse({ endpoint: EModelEndpoint.agents, model: 'agent_unloaded' }),
        queryClient,
      );

      expect(trackAgent).toHaveBeenCalledTimes(1);
      expect(trackAgent.mock.calls[0][1]).not.toHaveProperty('modelUsed');
    });

    it('skips responses the agent did not finish, and Assistants responses', () => {
      trackAgentResponse(createResponse({ unfinished: true }), queryClient);
      trackAgentResponse(createResponse({ error: true }), queryClient);
      trackAgentResponse(createResponse({ endpoint: EModelEndpoint.assistants }), queryClient);
      trackAgentResponse(undefined, queryClient);

      expect(trackAgent).not.toHaveBeenCalled();
    });
  });

  describe('trackAgentFeedback', () => {
    it('reports a newly saved rating as a reaction', () => {
      trackAgentFeedback(
        {
          conversationId: 'convo-1',
          messageId: 'response-1',
          feedback: { rating: 'thumbsDown', tag: 'inaccurate' },
        },
        undefined,
        EModelEndpoint.anthropic,
      );
      trackAgentFeedback(
        {
          conversationId: 'convo-1',
          messageId: 'response-2',
          feedback: { rating: 'thumbsUp', tag: 'accurate_reliable' },
        },
        undefined,
        EModelEndpoint.agents,
      );

      expect(trackAgent.mock.calls).toEqual([
        [
          'user_reaction',
          {
            agentId: AGENT_ID,
            conversationId: 'convo-1',
            messageId: 'response-1',
            content: 'negative',
          },
        ],
        [
          'user_reaction',
          {
            agentId: AGENT_ID,
            conversationId: 'convo-1',
            messageId: 'response-2',
            content: 'positive',
          },
        ],
      ]);
    });

    it('skips a cleared rating and a note added to the same rating', () => {
      trackAgentFeedback(
        { conversationId: 'convo-1', messageId: 'response-1' },
        'thumbsUp',
        EModelEndpoint.anthropic,
      );
      trackAgentFeedback(
        {
          conversationId: 'convo-1',
          messageId: 'response-1',
          feedback: { rating: 'thumbsDown', tag: 'other', text: 'Out of date' },
        },
        'thumbsDown',
        EModelEndpoint.anthropic,
      );

      expect(trackAgent).not.toHaveBeenCalled();
    });

    it('skips ratings on Assistants responses', () => {
      trackAgentFeedback(
        {
          conversationId: 'convo-1',
          messageId: 'response-1',
          feedback: { rating: 'thumbsUp', tag: 'clear_well_written' },
        },
        undefined,
        EModelEndpoint.assistants,
      );

      expect(trackAgent).not.toHaveBeenCalled();
    });
  });

  describe('trackAgentRetry', () => {
    it('reports a regenerate as a retry on the response it replaces', () => {
      trackAgentRetry(createResponse());

      expect(trackAgent).toHaveBeenCalledWith('user_reaction', {
        agentId: AGENT_ID,
        conversationId: 'convo-1',
        messageId: 'response-1',
        content: 'retry',
      });
    });
  });

  it('does nothing until Pendo has loaded trackAgent', () => {
    delete pendoWindow.pendo;
    expect(() => trackAgentResponse(createResponse(), queryClient)).not.toThrow();

    pendoWindow.pendo = {};
    expect(() => trackAgentRetry(createResponse())).not.toThrow();

    expect(trackAgent).not.toHaveBeenCalled();
  });

  it('never lets a Pendo failure reach the chat', () => {
    trackAgent.mockImplementation(() => {
      throw new Error('pendo unavailable');
    });

    expect(() => trackAgentPrompt(createTurn())).not.toThrow();
    expect(() => trackAgentResponse(createResponse(), queryClient)).not.toThrow();
    expect(trackAgent).toHaveBeenCalledTimes(2);
  });
});
