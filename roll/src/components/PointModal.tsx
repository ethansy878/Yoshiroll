import { useEffect, useState } from 'react'
import '../game.css'

type Result = { text: string; allowEnd: boolean }

type Props = {
    point: number | null
    result?: Result | null
    onResultContinue?: () => void
    onResultEnd?: () => void
}

export default function PointModal({ point, result = null, onResultContinue, onResultEnd }: Props) {
    const lines = [
        `Roll a ${point}, complete the cycle.`,
        'Roll a 7, lose a life.',
        'Roll anything else, gain budget.',
    ]

    const [revealed, setRevealed] = useState(0)
    const [closing, setClosing] = useState(false)

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
        }, 1000)
        return () => clearInterval(iv)
    }, [point])

    return (
        <div className={"point-modal" + (closing ? ' closing' : '')}>
            <div className="point-card">
                {!result && lines.map((l, i) => (
                    <p key={i} className={"line" + (i < revealed ? ' show' : '')}>
                        {l}
                    </p>
                ))}

                {result && (
                    <div className="result-card">
                        <p>{result.text}</p>
                        <div className="result-actions">
                            <button onClick={() => onResultContinue && onResultContinue()}>Continue</button>
                            {result.allowEnd && <button onClick={() => onResultEnd && onResultEnd()}>End Game</button>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
