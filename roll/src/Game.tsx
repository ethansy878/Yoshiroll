import React, { useState } from 'react'
import './game.css'
import PointModal from './components/PointModal'
import PostModal from './components/PostModal'
import DiceGrid from './components/DiceGrid'

type Attr = { label?: string; color?: string }

const NUMBERS = Array.from({ length: 11 }, (_, i) => i + 2)
const WORD_NUMBERS = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE"]

function clamp(n: number, a = 2, b = 12) {
    return Math.max(a, Math.min(b, n))
}

function Dice({
    value,
    rolling,
    onClick,
    faceAttr,
}: {
    value: number
    rolling: boolean
    onClick: () => void
    faceAttr?: Attr
}) {
    // pip positions for a 3x3 grid indexed 0..8 left->right top->bottom
    const layout: Record<number, number[]> = {
        1: [4],
        2: [0, 8],
        3: [0, 4, 8],
        4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8],
        6: [0, 3, 6, 2, 5, 8],
    }
    const positions = layout[value] || []

    return (
        <button className={"dice " + (rolling ? 'rolling' : '')} onClick={onClick} aria-label={`Die ${value}`}>
            {value === 0 || rolling ? (
                <div className="rolling-face">…</div>
            ) : (
                <div className="pips" aria-hidden>
                    {Array.from({ length: 9 }).map((_, i) => (
                        <div className="pip-slot" key={i}>
                            <span className={"pip " + (positions.includes(i) ? 'show' : '')} />
                        </div>
                    ))}
                </div>
            )}
            {faceAttr && (
                <div className="face-attr" style={{ background: faceAttr.color || 'transparent' }}>
                    {faceAttr.label}
                </div>
            )}
        </button>
    )
}

export default function Game() {
    const [phase, setPhase] = useState<'comeout' | 'point' | 'ended'>('comeout')
    const [die1, setDie1] = useState<number>(1)
    const [die2, setDie2] = useState<number>(1)
    const [rolling, setRolling] = useState(false)

    const [score, setScore] = useState(0)
    const [lives, setLives] = useState(3)
    const [hp, setHp] = useState(100)

    const [cycle, setCycle] = useState(1)
    const [point, setPoint] = useState<number | null>(null)
    // modal for showing results (replaces inline `message`)
    const [resultModal, setResultModal] = useState<{ visible: boolean; text: string; allowEnd: boolean }>({ visible: false, text: '', allowEnd: false })
    // track rolls to detect Zero-Cycle (first roll of the game)
    const [rollCount, setRollCount] = useState(0)
    const [zeroCycleActive, setZeroCycleActive] = useState(false)
    // last rolled number marker for bottom GUI
    const [lastRoll, setLastRoll] = useState<number | null>(null)
    // last evaluated roll value (used to decide continue/end behavior)
    const [lastEvaluated, setLastEvaluated] = useState<number | null>(null)

    // powerups: three uses each
    const [prePlus, setPrePlus] = useState(3)
    const [preMinus, setPreMinus] = useState(3)
    const [postPlus, setPostPlus] = useState(3)
    const [postMinus, setPostMinus] = useState(3)

    // 0 | 1 | -1 for pending pre-adjust
    const [pendingPreAdjust, setPendingPreAdjust] = useState<0 | 1 | -1>(0)

    // awaiting post-adjust opportunity when in a point cycle
    const [awaitingPost, setAwaitingPost] = useState(false)
    const [rawResult, setRawResult] = useState<number | null>(null)
    const [finalResult, setFinalResult] = useState<number | null>(null)

    // maps for hp damage and attributes (color/label)
    const [hpDamageMap, setHpDamageMap] = useState<Record<number, number>>({})
    const [numAttrMap, setNumAttrMap] = useState<Record<number, Attr>>({})
    const [faceAttrMap, setFaceAttrMap] = useState<Record<number, Attr>>({})

    const [showPointModal, setShowPointModal] = useState(false)

    const roll = () => {
        // block rolling when other UI modals are visible (still block when result shown or post modal active)
        if (rolling || resultModal.visible || awaitingPost) return

        const isFirstRoll = rollCount === 0
        setRollCount((r) => r + 1)

        // decide pre-adjust and consume only if available
        let usedPre: 0 | 1 | -1 = pendingPreAdjust
        if (usedPre === 1 && prePlus <= 0) usedPre = 0
        if (usedPre === -1 && preMinus <= 0) usedPre = 0

        if (usedPre === 1) setPrePlus((p) => Math.max(0, p - 1))
        if (usedPre === -1) setPreMinus((p) => Math.max(0, p - 1))
        setPendingPreAdjust(0)

        setRolling(true)

        const r1 = Math.floor(Math.random() * 6) + 1
        const r2 = Math.floor(Math.random() * 6) + 1

        // independent animations
        setDie1(0)
        setDie2(0)
        const d1Delay = 350 + Math.random() * 400
        const d2Delay = 350 + Math.random() * 400
        setTimeout(() => setDie1(r1), d1Delay)
        setTimeout(() => setDie2(r2), d2Delay)

        const maxDelay = Math.max(d1Delay, d2Delay) + 120
        setTimeout(() => {
            const raw = r1 + r2
            setRawResult(raw)
            const adjusted = clamp(raw + usedPre)
            setFinalResult(adjusted)
            // mark the last rolled number for the bottom GUI
            setLastRoll(adjusted)

            if (phase === 'comeout') {
                if (adjusted === 7) {
                    // show modal telling the user to roll again (no End Game option here)
                    setResultModal({ visible: true, text: 'Rolled a 7 — roll again.', allowEnd: false })
                    setShowPointModal(true)
                    setRolling(false)
                } else {
                    setPoint(adjusted)
                    // if this was the very first roll of the game, mark zero-cycle
                    if (isFirstRoll) setZeroCycleActive(true)
                    setPhase('point')
                    setShowPointModal(true)
                    setRolling(false)
                }
            } else if (phase === 'point') {
                // allow post-adjust before final evaluation
                setAwaitingPost(true)
                setRolling(false)
            }
        }, maxDelay)
    }

    const applyPostAdjust = (delta: 1 | -1) => {
        if (!awaitingPost || finalResult == null) return
        if (delta === 1 && postPlus <= 0) return
        if (delta === -1 && postMinus <= 0) return

        if (delta === 1) setPostPlus((p) => Math.max(0, p - 1))
        if (delta === -1) setPostMinus((p) => Math.max(0, p - 1))

        const newFinal = clamp((finalResult || 0) + delta)
        setFinalResult(newFinal)
        setAwaitingPost(false)
        evaluatePoint(newFinal)
    }

    const finalizeNoPost = () => {
        if (!awaitingPost || finalResult == null) return
        setAwaitingPost(false)
        evaluatePoint(finalResult)
    }

    const evaluatePoint = (value: number) => {
        // remember value for later continue/end decisions
        setLastEvaluated(value)
        const dmg = hpDamageMap[value] || 0
        const nextHp = Math.max(0, hp - dmg)
        let nextLives = lives
        let deltaScore = 0
        let finalMsg = ''

        if (value === point) {
            deltaScore = 100
            // Zero-Cycle bonus: extra 100 if this point was set on the very first roll
            if (zeroCycleActive) {
                deltaScore += 100
                setZeroCycleActive(false)
                finalMsg = `You rolled the Point (${value}) — +${deltaScore} points! (Zero-Cycle bonus!)`
            } else {
                finalMsg = `You rolled the Point (${value}) — +100 points!`
            }
            setCycle(cycle + 1)
        } else if (value === 7) {
            nextLives = Math.max(0, lives - 1)
            finalMsg = `Rolled a 7 — lost 1 life.`
            setCycle(cycle + 1)
        } else {
            deltaScore = 10
            finalMsg = `Rolled ${value} — +10 points.`
            // continue the point cycle (do not end the point when neither the point nor 7 are rolled)
        }

        if (deltaScore) setScore((s) => s + deltaScore)
        if (dmg) setHp(nextHp)
        setLives(nextLives)

        // auto-end if HP or lives hit zero
        if (nextLives <= 0) {
            // immediate redirect when lives reach 0
            const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
            try {
                // navigate away immediately
                window.location.href = url
            } catch (e) {
                try { window.open(url, '_blank') } catch {}
            }
            setPhase('ended')
            return
        }
        if (nextHp <= 0) {
            setPhase('ended')
            return
        }

        // show result modal; allow 'End Game' only when rolling the Point or a 7 during point cycle
        setResultModal({ visible: true, text: finalMsg, allowEnd: value === point || value === 7 })
    }

    const handleResultContinue = () => {
        if (!resultModal.visible) return
        const val = lastEvaluated
        // close the result overlay
        setResultModal({ visible: false, text: '', allowEnd: false })
        setRawResult(null)
        setFinalResult(null)
        setAwaitingPost(false)

        // if the roll ended the cycle (point or 7), return to comeout and hide the point modal
        if (val === point || val === 7) {
            setPhase('comeout')
            setPoint(null)
            setShowPointModal(false)
        }
        // otherwise keep the point modal visible and continue the cycle
    }

    const handleResultEnd = () => {
        setResultModal({ visible: false, text: '', allowEnd: false })
        setShowPointModal(false)
        setPhase('ended')
    }

    const resetGame = () => {
        setScore(0)
        setLives(3)
        setHp(100)
        setPoint(null)
        setPhase('comeout')
        setPrePlus(3)
        setPreMinus(3)
        setPostPlus(3)
        setPostMinus(3)
        setResultModal({ visible: false, text: '', allowEnd: false })
        setRawResult(null)
        setFinalResult(null)
        setFaceAttrMap({})
        setNumAttrMap({})
        setHpDamageMap({})
    }

    const setHpDamage = (n: number, value: number) => {
        setHpDamageMap((m) => ({ ...m, [n]: value }))
    }

    const setNumberAttr = (n: number, a: Attr) => {
        setNumAttrMap((m) => ({ ...m, [n]: a }))
    }

    const setFaceAttr = (n: number, a: Attr) => {
        setFaceAttrMap((m) => ({ ...m, [n]: a }))
    }

    // expose helper setters for the console / dev tooling (prevents unused local errors)
    ;(globalThis as any).__gameHelpers = {
        setHpDamage,
        setNumberAttr,
        setFaceAttr,
    }

    if (phase === 'ended') {
        return (
            <div className="game-root ended">
                <div className="final">
                    <h1>Game Over</h1>
                    <p>Score: {score}</p>
                    <p>Lives: {lives}</p>
                    <p>HP: {hp}</p>
                    <button onClick={resetGame}>Play again</button>
                </div>
            </div>
        )
    }
    return (
        <div className={"game-root " + (phase === 'point' ? 'point-active' : '')}>
            {phase === 'point' && (
                <>
                    <div className="page-bg" aria-hidden />
                    <div className="grid-bg" aria-hidden />
                </>
            )}

            {/* <header className="top-bar">
                <div className="status">
                    <strong>Score:</strong> {score} <strong>Lives:</strong> {lives} <strong>HP:</strong>{' '}
                    {hp}
                </div>
                <div className="powerups">
                    <div>Pre +: {prePlus}</div>
                    <div>Pre -: {preMinus}</div>
                    <div>Post +: {postPlus}</div>
                    <div>Post -: {postMinus}</div>
                </div>
                <div>
                    <button onClick={() => { if (window.confirm('End game?')) setPhase('ended') }}>End Game</button>
                </div>
            </header> */}

            <main className={"play-area" + ((resultModal.visible || awaitingPost) ? ' modal-open' : '')}>
                <h1 className="main-title">{phase === 'comeout' ? 'Roll.' : `Cycle ${cycle}`}</h1> <br/>

                <div className="dice-row">
                    <Dice value={die1} rolling={rolling && die1 === 0} onClick={roll} faceAttr={faceAttrMap[die1]} />
                    <Dice value={die2} rolling={rolling && die2 === 0} onClick={roll} faceAttr={faceAttrMap[die2]} />
                </div> <br/> <br/>

                {phase === 'point' && (
                    <div className="health-row">
                        <div className="heart">❤
                            <div className="lives-text">x{lives}</div>
                        </div>
                        <div className="hp-bar" aria-hidden>
                            <div className="hp-fill" style={{ width: `${Math.max(0, Math.min(100, hp))}%` }} />
                        </div>
                    </div>
                )}



                {/* <div className="controls">
                    <div className="pre-controls">
                        <label>Adjust</label>
                        <button
                            onClick={() => setPendingPreAdjust((p) => (p === 1 ? 0 : 1))}
                            disabled={prePlus <= 0}
                        >
                            +1
                        </button>
                        <button
                            onClick={() => setPendingPreAdjust((p) => (p === -1 ? 0 : -1))}
                            disabled={preMinus <= 0}
                        >
                            -1
                        </button>
                        <div className="small">Selected: {pendingPreAdjust}</div>
                    </div>
                    <div className="post-controls">
                        <label>Post-adjust (use after roll):</label>
                        <button onClick={() => applyPostAdjust(1)} disabled={!awaitingPost || postPlus <= 0}>+1</button>
                        <button onClick={() => applyPostAdjust(-1)} disabled={!awaitingPost || postMinus <= 0}>-1</button>
                        <button onClick={() => finalizeNoPost()} disabled={!awaitingPost}>Confirm</button>
                    </div>
                </div> */}

                {/* result messages are shown in modal */}

                {showPointModal &&
                    <PointModal
                        point={point}
                        result={resultModal.visible ? { text: resultModal.text, allowEnd: resultModal.allowEnd } : null}
                        onResultContinue={handleResultContinue}
                        onResultEnd={handleResultEnd}
                    />
                }

                <section className="bottom-panel">
                    <div className="numbers">
                        {NUMBERS.map((n) => {
                            const attr = numAttrMap[n]
                            const style: React.CSSProperties = {}
                            style.zIndex = 10;
                            if (n === 7) style.background = '#ff6b6b'
                            if (n === 7 && phase === 'comeout') style.background = '#81e6d9'
                            if (n === point) style.background = '#81e6d9'
                            if (attr && attr.color) style.background = attr.color
                                return (
                                <div key={n} className="num" style={style}>
                                    {lastRoll === n && <div className="v-marker">V</div>}
                                    <div className="num-label">{n}{attr && attr.label ? ` • ${attr.label}` : ''}</div>
                                    {/* <input
                                        type="color"
                                        title="attribute color"
                                        value={(attr && attr.color) || '#000000'}
                                        onChange={(e) => setNumberAttr(n, { ...(attr || {}), color: e.target.value })}
                                    />
                                    <input
                                        className="hp-input"
                                        type="number"
                                        min={0}
                                        placeholder="HP dmg"
                                        value={hpDamageMap[n] ?? ''}
                                        onChange={(e) => setHpDamage(n, Number(e.target.value) || 0)}
                                    />
                                    <input
                                        className="label-input"
                                        placeholder="label"
                                        value={(attr && attr.label) || ''}
                                        onChange={(e) => setNumberAttr(n, { ...(attr || {}), label: e.target.value })}
                                    /> */}
                                </div>
                            )
                        })}
                    </div>

                {awaitingPost && finalResult != null && (
                    <PostModal raw={rawResult} final={WORD_NUMBERS[finalResult]} postPlus={postPlus} postMinus={postMinus} onApply={applyPostAdjust} onAccept={finalizeNoPost} />
                )}


                    {/* <div className="face-config">
                        <h4>Die face attributes</h4>
                        <div className="faces">
                            {DIE_FACES.map((f) => {
                                const fa = faceAttrMap[f]
                                return (
                                    <div className="face-config-item" key={f}>
                                        <div className="num-label">{f}</div>
                                        <input
                                            type="color"
                                            value={(fa && fa.color) || '#000000'}
                                            onChange={(e) => setFaceAttr(f, { ...(fa || {}), color: e.target.value })}
                                        />
                                        <input
                                            placeholder="label"
                                            value={(fa && fa.label) || ''}
                                            onChange={(e) => setFaceAttr(f, { ...(fa || {}), label: e.target.value })}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </div> */}
                </section>


                

                {/* dice-grid background component */}
                {phase === 'point' && <DiceGrid />}

                <h1 className="points">{`Points: ${score}`}</h1>
            </main>
        </div>
    )
}

