export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
        <path
          d="M16 25V13m0 0c0-4 3-7 7-7 0 4-3 7-7 7Zm0 4c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5Z"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          className="text-accent"
        />
      </svg>
      <span>
        HarvestT <span className="font-light text-muted">Cortex</span>
      </span>
    </span>
  )
}
