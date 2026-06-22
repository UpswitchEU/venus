import { describe, expect, it } from 'vitest'

import {
  classifySessionSaveQueueRequest,
  isActiveSessionLoad,
  isActiveSessionSaveQueue,
  shouldQueueUpdateForActiveLoad,
  shouldRunFollowUpSave,
  shouldSkipAutosavePayload,
} from './AuthenticatedSessionConcurrencyModel'

describe('AuthenticatedSessionConcurrencyModel', () => {
  it('accepts only the current load token and report as active', () => {
    expect(
      isActiveSessionLoad({
        loadToken: 3,
        activeLoadSequence: 3,
        reportId: 'val_active',
        loadingReportId: 'val_active',
      })
    ).toBe(true)

    expect(
      isActiveSessionLoad({
        loadToken: 2,
        activeLoadSequence: 3,
        reportId: 'val_active',
        loadingReportId: 'val_active',
      })
    ).toBe(false)

    expect(
      isActiveSessionLoad({
        loadToken: 3,
        activeLoadSequence: 3,
        reportId: 'val_stale',
        loadingReportId: 'val_active',
      })
    ).toBe(false)
  })

  it('queues updates for an in-flight report that differs from the current session', () => {
    expect(
      shouldQueueUpdateForActiveLoad({
        isLoading: true,
        loadingReportId: 'val_next',
        currentReportId: 'val_previous',
      })
    ).toBe(true)

    expect(
      shouldQueueUpdateForActiveLoad({
        isLoading: true,
        loadingReportId: 'val_current',
        currentReportId: 'val_current',
      })
    ).toBe(false)

    expect(
      shouldQueueUpdateForActiveLoad({
        isLoading: false,
        loadingReportId: 'val_next',
        currentReportId: 'val_previous',
      })
    ).toBe(false)
  })

  it('classifies save callers against the active report and lifecycle', () => {
    expect(
      classifySessionSaveQueueRequest({
        hasSavePromise: false,
        saveReportId: null,
        saveLifecycleVersion: 0,
        activeReportId: 'val_current',
        activeLifecycleVersion: 0,
      })
    ).toBe('start')

    expect(
      classifySessionSaveQueueRequest({
        hasSavePromise: true,
        saveReportId: 'val_current',
        saveLifecycleVersion: 4,
        activeReportId: 'val_current',
        activeLifecycleVersion: 4,
      })
    ).toBe('join')

    expect(
      classifySessionSaveQueueRequest({
        hasSavePromise: true,
        saveReportId: 'val_previous',
        saveLifecycleVersion: 4,
        activeReportId: 'val_current',
        activeLifecycleVersion: 4,
      })
    ).toBe('detach')

    expect(
      classifySessionSaveQueueRequest({
        hasSavePromise: true,
        saveReportId: 'val_current',
        saveLifecycleVersion: 3,
        activeReportId: 'val_current',
        activeLifecycleVersion: 4,
      })
    ).toBe('detach')
  })

  it('keeps save responses scoped to the report and lifecycle that started them', () => {
    expect(
      isActiveSessionSaveQueue({
        queueReportId: 'val_current',
        queueLifecycleVersion: 2,
        currentReportId: 'val_current',
        sessionLifecycleVersion: 2,
      })
    ).toBe(true)

    expect(
      isActiveSessionSaveQueue({
        queueReportId: 'val_previous',
        queueLifecycleVersion: 2,
        currentReportId: 'val_current',
        sessionLifecycleVersion: 2,
      })
    ).toBe(false)

    expect(
      isActiveSessionSaveQueue({
        queueReportId: 'val_current',
        queueLifecycleVersion: 1,
        currentReportId: 'val_current',
        sessionLifecycleVersion: 2,
      })
    ).toBe(false)
  })

  it('schedules a follow-up save only when a newer local mutation exists', () => {
    expect(
      shouldRunFollowUpSave({
        hasCurrentSession: true,
        currentMutationVersion: 7,
        savedMutationVersion: 6,
      })
    ).toBe(true)

    expect(
      shouldRunFollowUpSave({
        hasCurrentSession: true,
        currentMutationVersion: 6,
        savedMutationVersion: 6,
      })
    ).toBe(false)

    expect(
      shouldRunFollowUpSave({
        hasCurrentSession: false,
        currentMutationVersion: 7,
        savedMutationVersion: 6,
      })
    ).toBe(false)
  })

  it('skips only unchanged autosave payloads', () => {
    expect(
      shouldSkipAutosavePayload({
        reason: 'autosave',
        payloadFingerprint: 'payload-a',
        lastPersistedFingerprint: 'payload-a',
      })
    ).toBe(true)

    expect(
      shouldSkipAutosavePayload({
        reason: 'user',
        payloadFingerprint: 'payload-a',
        lastPersistedFingerprint: 'payload-a',
      })
    ).toBe(false)

    expect(
      shouldSkipAutosavePayload({
        reason: 'autosave',
        payloadFingerprint: 'payload-b',
        lastPersistedFingerprint: 'payload-a',
      })
    ).toBe(false)
  })
})
