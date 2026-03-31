import { useMemo } from 'react'
import '../game.css'

const DIE_LAYOUT: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 3, 6, 2, 5, 8],
}

export default function DiceGrid({ cols = 30, rows = 20, tile = 64 }: { cols?: number; rows?: number; tile?: number }) {
  const cells = useMemo(() => {
    const arr: number[] = []
    for (let i = 0; i < cols * rows; i++) arr.push(Math.floor(Math.random() * 6) + 1)
    return arr
  }, [cols, rows])

  return (
    <div className="dice-grid-wrap" aria-hidden>
      <div className="dice-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${tile}px)` }}>
        {cells.map((v, i) => (
          <div className="grid-tile" key={i} style={{ width: tile, height: tile }}>
            <div className="dice small">
              <div className="pips">
                {Array.from({ length: 9 }).map((_, j) => (
                  <div className="pip-slot" key={j}>
                    <span className={"pip " + (DIE_LAYOUT[v].includes(j) ? 'show' : '')} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
