import { useEffect, useMemo, useRef, useState } from 'react'
import { Message, MessageCard } from './MessageCard'
import { cn } from '../../utils'

interface MessageListProps {
  messages: Message[]
  className?: string
  /**
   * The scrollable container that holds this message list.
   * Needed for "smart" auto-scroll + scroll position memory.
   */
  scrollContainerRef?: React.RefObject<HTMLElement>
  /** A stable key (e.g. sessionId) to persist scroll position. */
  scrollKey?: string
  /** Remember scroll position across reloads. Defaults to true when scrollKey is provided. */
  rememberScroll?: boolean
  /** Auto-scroll behavior when new messages arrive. */
  autoScroll?: 'smart' | 'always' | 'never'
}

const BOTTOM_THRESHOLD_PX = 80

function isNearBottom(el: HTMLElement, thresholdPx: number) {
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  return distance <= thresholdPx
}

export function MessageList({
  messages,
  className,
  scrollContainerRef,
  scrollKey,
  rememberScroll,
  autoScroll = 'smart'
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const lastInitKeyRef = useRef<string | null>(null)
  const pendingInitRef = useRef(false)
  const pendingSaveRafRef = useRef<number | null>(null)
  const pendingSaveTopRef = useRef<number>(0)

  const [showJumpToLatest, setShowJumpToLatest] = useState(false)

  const storageKey = useMemo(() => {
    if (!scrollKey) return null
    return `codeall:chat-scroll:${scrollKey}`
  }, [scrollKey])

  useEffect(() => {
    const container = scrollContainerRef?.current
    if (!container) {
      // Fallback: keep legacy behavior when no container is provided.
      if (autoScroll !== 'never') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    if (autoScroll === 'never') return

    // In smart mode, only stick when user is already at bottom (or near it).
    if (autoScroll === 'smart' && !atBottomRef.current) return

    // Avoid excessive smooth scrolling while streaming chunks arrive.
    const lastMsg = messages[messages.length - 1]
    const behavior: ScrollBehavior = lastMsg?.isStreaming ? 'auto' : 'smooth'
    container.scrollTo({ top: container.scrollHeight, behavior })
  }, [messages, autoScroll, scrollContainerRef])

  useEffect(() => {
    const container = scrollContainerRef?.current
    if (!container) return

    // Initialize / restore scroll position when key changes (or first time it becomes available).
    const key = storageKey
    if (key && lastInitKeyRef.current !== key) {
      lastInitKeyRef.current = key
      pendingInitRef.current = true
    }
  }, [storageKey, scrollContainerRef])

  useEffect(() => {
    const container = scrollContainerRef?.current
    const key = storageKey
    if (!container) return
    if (!key) return
    if (!pendingInitRef.current) return

    pendingInitRef.current = false

    const shouldRemember = rememberScroll ?? true
    const savedTopRaw = shouldRemember ? localStorage.getItem(key) : null

    // Defer until DOM is painted, so scrollHeight is correct.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return

        if (savedTopRaw != null) {
          const savedTop = Number(savedTopRaw)
          if (Number.isFinite(savedTop)) scrollContainerRef.current.scrollTop = savedTop
        } else {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
        }

        const atBottomNow = isNearBottom(scrollContainerRef.current, BOTTOM_THRESHOLD_PX)
        atBottomRef.current = atBottomNow
        setShowJumpToLatest(!atBottomNow)
      })
    })
  }, [messages.length, storageKey, rememberScroll, scrollContainerRef])

  useEffect(() => {
    const container = scrollContainerRef?.current
    if (!container) return

    const shouldRemember = (rememberScroll ?? true) && !!storageKey

    const onScroll = () => {
      const atBottomNow = isNearBottom(container, BOTTOM_THRESHOLD_PX)
      atBottomRef.current = atBottomNow
      setShowJumpToLatest(!atBottomNow)

      if (!shouldRemember) return

      pendingSaveTopRef.current = container.scrollTop
      if (pendingSaveRafRef.current != null) return
      pendingSaveRafRef.current = requestAnimationFrame(() => {
        pendingSaveRafRef.current = null
        if (!storageKey) return
        localStorage.setItem(storageKey, String(pendingSaveTopRef.current))
      })
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    // Seed state from current position.
    onScroll()

    return () => {
      container.removeEventListener('scroll', onScroll)
      if (pendingSaveRafRef.current != null) cancelAnimationFrame(pendingSaveRafRef.current)
      pendingSaveRafRef.current = null
    }
  }, [scrollContainerRef, storageKey, rememberScroll])

  const scrollToLatest = () => {
    const container = scrollContainerRef?.current
    if (!container) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className={cn('flex flex-col space-y-6 pb-4', className)}>
      {messages.map(msg => (
        <MessageCard key={msg.id} message={msg} />
      ))}

      {showJumpToLatest && (
        <div className="sticky bottom-4 flex justify-end pointer-events-none">
          <button
            type="button"
            onClick={scrollToLatest}
            className="pointer-events-auto rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-primary)] backdrop-blur hover:border-[var(--border-secondary)] hover:bg-[var(--bg-tertiary)]"
            aria-label="Jump to latest message"
            title="跳到最新消息"
          >
            跳到最新
          </button>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}
