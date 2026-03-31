import '../game.css'

type Props = {
  text: string
  allowEnd?: boolean
  onContinue: () => void
  onEnd: () => void
}

export default function ResultModal({ text, allowEnd = false, onContinue, onEnd }: Props) {
  return (
    <div className="result-modal">
      <div className="result-card">
        <h3>{text}</h3>
        <div className="result-actions">
          {allowEnd && <button onClick={onEnd}>End Game</button>}
          <button onClick={onContinue}>Continue</button>
        </div>
      </div>
    </div>
  )
}
