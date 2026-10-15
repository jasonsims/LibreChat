import React, { useState } from 'react';
import { useClearConversationsMutation } from 'librechat-data-provider/react-query';
import {
  OGDialogTemplate,
  Label,
  Button,
  OGDialog,
  OGDialogTrigger,
  Spinner,
} from '@librechat/client';
import { clearAllConversationStorage } from '~/utils';
import { useLocalize, useNewConvo } from '~/hooks';
import { pendo } from '~/lib/pendo';

export const ClearChats = () => {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const { newConversation } = useNewConvo();
  const clearConvosMutation = useClearConversationsMutation();

  const clearConvos = () => {
    clearConvosMutation.mutate(
      {},
      {
        onSuccess: () => {
          // FORK: Pendo track event.
          pendo.track('all_conversations_deleted', { source: 'settings_data_controls' });
          clearAllConversationStorage();
          newConversation();
        },
      },
    );
  };

  return (
    <div className="flex items-center justify-between">
      <Label id="clear-all-chats-label">{localize('com_nav_clear_all_chats')}</Label>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <Button
            aria-labelledby="clear-all-chats-label"
            variant="destructive"
            onClick={() => setOpen(true)}
          >
            {localize('com_ui_delete')}
          </Button>
        </OGDialogTrigger>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_nav_confirm_clear')}
          className="max-w-[28.125rem]"
          main={
            <Label className="break-words">
              {localize('com_nav_clear_conversation_confirm_message')}
            </Label>
          }
          selection={{
            selectHandler: clearConvos,
            selectClasses:
              'bg-surface-destructive text-text-on-status transition-all duration-200 hover:bg-surface-destructive-hover',
            selectText: clearConvosMutation.isLoading ? <Spinner /> : localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
};
