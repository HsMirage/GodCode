const dotClassName = 'inline-block animate-pulse text-emerald-300/90'

export function TypingIndicator() {
  return (
    <span className='inline-flex items-center gap-1 text-xs leading-none'>
      <span className={dotClassName} style={{ animationDelay: '0ms' }}>
        ●
      </span>
      <span className={dotClassName} style={{ animationDelay: '150ms' }}>
        ●
      </span>
      <span className={dotClassName} style={{ animationDelay: '300ms' }}>
        ●
      </span>
    </span>
  )
}
