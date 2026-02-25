import { ONE_MINUTE } from '../../tools/utils/timeUtils'

export interface RateLimitError {
  message: string
  source: 'agent'
}

export interface EventRateLimiter {
  isLimitReached: () => boolean
  stop: () => void
}

/**
 * Creates an event rate limiter that limits events per minute by type.
 * When the limit is reached, it calls onLimitReached once and then drops subsequent events.
 * The counter resets every minute.
 */
export function createEventRateLimiter(
  eventType: string,
  limit: number,
  onLimitReached: (error: RateLimitError) => void
): EventRateLimiter {
  let eventCount = 0
  let allowNextEvent = false
  let resetTimer: ReturnType<typeof setTimeout> | undefined

  return {
    isLimitReached() {
      // Start the reset timer on first event
      if (eventCount === 0) {
        resetTimer = setTimeout(() => {
          eventCount = 0
        }, ONE_MINUTE)
      }

      eventCount += 1

      // Allow if under limit or if we need to send the limit notification
      if (eventCount <= limit || allowNextEvent) {
        allowNextEvent = false
        return false
      }

      // Send one notification when limit is first exceeded
      if (eventCount === limit + 1) {
        allowNextEvent = true
        try {
          onLimitReached({
            message: `Reached max number of ${eventType}s by minute: ${limit}`,
            source: 'agent',
          })
        } finally {
          allowNextEvent = false
        }
      }

      return true
    },

    stop() {
      if (resetTimer) {
        clearTimeout(resetTimer)
        resetTimer = undefined
      }
    },
  }
}
