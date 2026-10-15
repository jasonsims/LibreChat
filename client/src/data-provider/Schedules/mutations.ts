/* Scheduled chats */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type {
  TSchedule,
  TCreateSchedule,
  TUpdateSchedule,
  TScheduleRunNowResponse,
} from 'librechat-data-provider';
import type { UseMutationOptions } from '@tanstack/react-query';
import { trackScheduledRun } from './admission';
import { pendo } from '~/lib/pendo';

export const useCreateScheduleMutation = (
  options?: UseMutationOptions<TSchedule, Error, TCreateSchedule>,
) => {
  const queryClient = useQueryClient();
  return useMutation<TSchedule, Error, TCreateSchedule>(
    [MutationKeys.createSchedule],
    (payload: TCreateSchedule) => dataService.createSchedule(payload),
    {
      ...options,
      onSuccess: (...args) => {
        queryClient.invalidateQueries([QueryKeys.schedules]);
        // FORK: Pendo track event. `ScheduleDialog` is this hook's only caller; never the prompt.
        const [schedule, payload] = args;
        const cadence = payload?.cadence;
        pendo.track('schedule_created', {
          frequency: cadence?.frequency,
          daysOfWeekCount: cadence?.frequency !== 'cron' ? cadence?.daysOfWeek?.length : undefined,
          timezone: payload?.timezone,
          hasProject: !!payload?.chatProjectId,
          promptLength: payload?.prompt?.length,
          fileCount: payload?.file_ids?.length ?? 0,
          agent_id: payload?.agent_id,
          scheduleId: schedule?.id,
        });
        options?.onSuccess?.(...args);
      },
    },
  );
};

export type UpdateScheduleParams = { id: string; payload: TUpdateSchedule };
export const useUpdateScheduleMutation = (
  options?: UseMutationOptions<TSchedule, Error, UpdateScheduleParams>,
) => {
  const queryClient = useQueryClient();
  return useMutation<TSchedule, Error, UpdateScheduleParams>(
    [MutationKeys.updateSchedule],
    ({ id, payload }: UpdateScheduleParams) => dataService.updateSchedule(id, payload),
    {
      ...options,
      onSuccess: (...args) => {
        queryClient.invalidateQueries([QueryKeys.schedules]);
        // FORK: Pendo track event. Only `ScheduleCard`'s switch sends `enabled`; the dialog never does.
        const [schedule, variables] = args;
        const payload: TUpdateSchedule = variables?.payload ?? {};
        pendo.track('schedule_updated', {
          updateSource: 'enabled' in payload ? 'card_toggle' : 'dialog',
          outcome: 'success',
          updatedFields: Object.keys(payload).filter((key) => key !== 'expectedConfigRevision'),
          cadenceChanged: payload.cadence != null,
          frequency: schedule?.cadence?.frequency,
          enabled: schedule?.enabled,
          scheduleId: variables?.id,
        });
        options?.onSuccess?.(...args);
      },
    },
  );
};

export const useDeleteScheduleMutation = (
  options?: UseMutationOptions<{ id: string }, Error, string>,
) => {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, Error, string>(
    [MutationKeys.deleteSchedule],
    (id: string) => dataService.deleteSchedule(id),
    {
      ...options,
      // An `unconfirmed` 503 is still a server-side mutation: the schedule has
      // already been disabled, marked deleting, and hidden from list reads.
      // Refresh on either outcome so the card cannot remain actionable in cache.
      onSettled: (...args) => {
        queryClient.invalidateQueries([QueryKeys.schedules]);
        options?.onSettled?.(...args);
      },
    },
  );
};

export const useRunScheduleNowMutation = (
  options?: UseMutationOptions<TScheduleRunNowResponse, Error, string>,
) => {
  const queryClient = useQueryClient();
  return useMutation<TScheduleRunNowResponse, Error, string>(
    [MutationKeys.runSchedule],
    (id: string) => dataService.runScheduleNow(id),
    {
      ...options,
      onSuccess: (data, ...rest) => {
        void trackScheduledRun(queryClient, data.conversationId);
        options?.onSuccess?.(data, ...rest);
      },
      // Invalidate on SETTLED, not just success: several run-now 409 paths are still
      // server-side mutations (a balance skip updates lastRun/counters and can
      // auto-disable; agent/permission/invalid-schedule skips disable the schedule
      // before returning), so the card must refresh on those errors too rather than
      // wait for the polling interval.
      onSettled: (...args) => {
        queryClient.invalidateQueries([QueryKeys.schedules]);
        options?.onSettled?.(...args);
      },
    },
  );
};
