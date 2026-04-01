import { useEffect, useState } from 'react'
import '../game.css'

type Result = { text: string; allowEnd: boolean }

type Props = {
  point: number | null
  result?: Result | null
  awaitingPost?: boolean
  raw?: number | null
  final?: string | null
  postPlus?: number
  postMinus?: number
  onApply?: (delta: 1 | -1) => void
  onAccept?: () => void
  onResultContinue?: () => void
  onResultEnd?: () => void
  losing?: number[]
}

export default function CombinedModal({ point, result = null, awaitingPost = false, raw = null, final = null, postPlus = 0, postMinus = 0, onApply, onAccept, onResultContinue, onResultEnd, losing }: Props) {
  const losingStr = (propsLosing: number[] | undefined) => {
    raw;
    if (!propsLosing || propsLosing.length === 0) return '7'
    if (propsLosing.length === 1) return String(propsLosing[0])
    return propsLosing.join(' or ')
  }

  const lines = [
    `Roll a ${point}, complete the cycle.`,
    `Roll a ${losingStr(losing)}, lose a life.`,
    'Roll anything else, gain budget. Numbers at the ends are worth more.',
  ]

  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    setRevealed(0)
    const iv = setInterval(() => {
      setRevealed((r) => {
        if (r >= lines.length) {
          clearInterval(iv)
          return r
        }
        return r + 1
      })
    }, 800)
    return () => clearInterval(iv)
  }, [point])

  if (!point && !result && !awaitingPost) return null

  return (
    <div className="combined-modal">
      <div className="point-card combined-card">
        {/* post-adjust UI has priority when awaitingPost */}
        {awaitingPost && final != null ? (
          <div className="post-section">
            <h3>{final}</h3>
            <div className="post-actions">
              <button onClick={() => onApply && onApply(-1)} disabled={postMinus! <= 0}>-1 (x{postMinus})</button>
              <button onClick={() => onAccept && onAccept()}>Accept</button>
              <button onClick={() => onApply && onApply(1)} disabled={postPlus! <= 0}>+1 (x{postPlus})</button>
            </div>
          </div>
        ) : result ? (
          <div className="result-card combined-result">
            <p>{result.text}</p>
            <div className="result-actions">
              {result.allowEnd && <button onClick={() => onResultEnd && onResultEnd()}>End Game</button>}
              <button onClick={() => onResultContinue && onResultContinue()}>Continue</button>
            </div>
          </div>
        ) : (
          <>
            {lines.map((l, i) => (
              <p key={i} className={"line" + (i < revealed ? ' show' : '')}>
                {l}
              </p>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
