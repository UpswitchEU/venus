/**
 * Message Handlers - DEPRECATED
 *
 * Message handling is now done directly via Zustand store in StreamEventHandler.
 * This class is kept for backward compatibility but is no longer used.
 *
 * @deprecated Use useConversationStore directly instead
 * @module services/chat/handlers/message/MessageHandlers
 */

import { chatLogger } from '../../../../utils/logger'
import { StreamEventHandlerCallbacks } from '../../StreamEventHandler'

/**
 * @deprecated Message handling now uses Zustand store directly
 */
export class MessageHandlers {
  private callbacks: StreamEventHandlerCallbacks

  constructor(callbacks: StreamEventHandlerCallbacks) {
    this.callbacks = callbacks
    chatLogger.warn(
      'MessageHandlers is deprecated - message handling now uses Zustand store directly'
    )
  }

  /**
   * Reset handler state (no-op, kept for compatibility)
   */
  reset(): void {
    // No-op - state is managed by Zustand store
  }

  /**
   * Handle typing indicator events (no-op, kept for compatibility)
   */
  handleTyping(_data: any): void {
    // No-op - handled directly in StreamEventHandler via store
  }

  /**
   * Handle message start events (no-op, kept for compatibility)
   */
  async handleMessageStart(_data: any): Promise<void> {
    // No-op - handled directly in StreamEventHandler via store
  }

  /**
   * Handle message chunk events (no-op, kept for compatibility)
   */
  async handleMessageChunk(_data: any): Promise<void> {
    // No-op - handled directly in StreamEventHandler via store
  }

  /**
   * Handle message complete events (no-op, kept for compatibility)
   */
  handleMessageComplete(_data: any): void {
    // No-op - handled directly in StreamEventHandler via store
  }
}
