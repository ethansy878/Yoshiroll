import '../game.css'

type Props = {
    raw?: number | null
    final?: string | null
    postPlus: number
    postMinus: number
    onApply: (delta: 1 | -1) => void
    onAccept: () => void
}

export default function PostModal({ raw, final, postPlus, postMinus, onApply, onAccept }: Props) {
    raw;
    return (
        <div className="post-modal">
            <div className="post-card">
                <h3>{final != null ? final : null}</h3>
                <div className="post-actions">
                    <button onClick={() => onApply(-1)} disabled={postMinus <= 0}>-1 (x{postMinus})</button>
                    <button onClick={onAccept}>Accept</button>
                    <button onClick={() => onApply(1)} disabled={postPlus <= 0}>+1 (x{postPlus})</button>
                </div>
            </div>
        </div>
    )
}
