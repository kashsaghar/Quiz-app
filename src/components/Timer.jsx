import { useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'

function formatTime(totalSeconds) {
  const safe = Math.max(0, totalSeconds)
  const mm = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0')
  const ss = Math.floor(safe % 60)
    .toString()
    .padStart(2, '0')
  return `${mm}:${ss}`
}

// Controlled by an absolute endTime (ms epoch) so a page refresh re-derives
// the correct remaining time instead of restarting the countdown.
export default function Timer({ endTime, onExpire, secondsLeft, setSecondsLeft }) {
  const expiredRef = useRef(false)

  useEffect(() => {
    const tick = () => {
      const remaining = Math.round((endTime - Date.now()) / 1000)
      setSecondsLeft(remaining)
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpire()
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [endTime, onExpire, setSecondsLeft])

  const urgent = secondsLeft <= 60

  return (
    <div
      className={`flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-sm font-semibold ${
        urgent ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'
      }`}
    >
      <Clock className="h-4 w-4" />
      {formatTime(secondsLeft)}
    </div>
  )
}
