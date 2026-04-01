import React, { useEffect, useRef, useState } from 'react'
import './game.css'
import CombinedModal from './components/CombinedModal'
import DiceGrid from './components/DiceGrid'

type Attr = { label?: string; color?: string }

const WORD_NUMBERS = [
    'ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE',
    'THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN','TWENTY',
    'TWENTY-ONE','TWENTY-TWO','TWENTY-THREE','TWENTY-FOUR'
]

function clamp(n: number, diceCount = 2) {
    const a = Math.max(1, diceCount)
    const b = diceCount * 6
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
    const [die3, setDie3] = useState<number>(1)
    const [die4, setDie4] = useState<number>(1)
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
    const [allCyclesCompleted, setAllCyclesCompleted] = useState(false)
    const [comeoutLosingCount, setComeoutLosingCount] = useState(0)

    // scoreboard digits and animation state
    const [displayDigits, setDisplayDigits] = useState<string[]>(String(score).padStart(5, '0').split(''))
    const prevScoreRef = useRef<number>(score)
    const digitTimeoutsRef = useRef<number[]>([])
    const pendingTargetDigitsRef = useRef<string[] | null>(null)
    const [animatingDigits, setAnimatingDigits] = useState<boolean[]>(Array(5).fill(false))

    function comeoutDamageForCount(count: number) {
        if (count <= 1) return 0
        if (count === 2) return 5
        if (count === 3) return 10
        if (count === 4) return 20
        if (count === 5) return 40
        if (count === 6) return 80
        return 100
    }

    const roll = () => {
        // block rolling when other UI modals are visible (still block when result shown or post modal active)
        if (rolling || resultModal.visible || awaitingPost) return

        setRollCount((r) => r + 1)
        const audio = new Audio('audio/Dice.mp3');
        audio.play();

        // decide pre-adjust and consume only if available
        let usedPre: 0 | 1 | -1 = pendingPreAdjust
        if (usedPre === 1 && prePlus <= 0) usedPre = 0
        if (usedPre === -1 && preMinus <= 0) usedPre = 0

        if (usedPre === 1) setPrePlus((p) => Math.max(0, p - 1))
        if (usedPre === -1) setPreMinus((p) => Math.max(0, p - 1))
        setPendingPreAdjust(0)

        setRolling(true)

        const diceCount = 2 + (cycle >= 3 ? 1 : 0) + (cycle >= 5 ? 1 : 0)
        const rolls: number[] = Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1)

        // set all dice to rolling face
        setDie1(0)
        setDie2(0)
        if (diceCount >= 3) setDie3(0)
        if (diceCount >= 4) setDie4(0)

        const delays = rolls.map(() => 350 + Math.random() * 400)
        // set them back individually
        setTimeout(() => setDie1(rolls[0]), delays[0])
        setTimeout(() => setDie2(rolls[1]), delays[1])
        if (diceCount >= 3) setTimeout(() => setDie3(rolls[2]), delays[2])
        if (diceCount >= 4) setTimeout(() => setDie4(rolls[3]), delays[3])

        const maxDelay = Math.max(...delays) + 120
        setTimeout(() => {
            const raw = rolls.reduce((a, b) => a + b, 0)
            setRawResult(raw)
            const adjusted = clamp(raw + usedPre, diceCount)
            setFinalResult(adjusted)
            // mark the last rolled number for the bottom GUI
            setLastRoll(adjusted)

            const losing = getLosingValues(diceCount)

            if (phase === 'comeout') {
                if (losing.includes(adjusted)) {
                    setResultModal({ visible: true, text: `Roll again.`, allowEnd: false })
                    setScore(score + 1)
                    setHp(hp - comeoutDamageForCount(comeoutLosingCount))
                    setComeoutLosingCount(comeoutLosingCount + 1)
                    setShowPointModal(true)
                    setRolling(false)
                } else {
                    setPoint(adjusted)
                    // if this was the very first roll of the game, mark zero-cycle
                    setZeroCycleActive(true)
                    setRollCount(0)
                    setPhase('point')
                    setShowPointModal(true)
                    setRolling(false)
                    new Audio('audio/Swap.mp3').play()
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

        const diceCount = 2 + (cycle >= 3 ? 1 : 0) + (cycle >= 5 ? 1 : 0)
        const newFinal = clamp((finalResult || 0) + delta, diceCount)
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
        // reflect the evaluated value (including post-adjust edits) in the V marker
        setLastRoll(value)
        const diceCount = 2 + (cycle >= 3 ? 1 : 0) + (cycle >= 5 ? 1 : 0)
        const losing = getLosingValues(diceCount)
        const dmg = hpDamageMap[value] || 0
        const nextHp = Math.max(0, hp - dmg)
        let nextLives = lives
        let deltaScore = 0
        let finalMsg = ''
        let finalMsg2 = ''
        let finalMsg3 = ''

        if (value === point) {
            deltaScore = 100
            // Zero-Cycle bonus: extra 100 if this point was set on the very first roll
            if (zeroCycleActive) {
                deltaScore += 100
                setZeroCycleActive(false)
                finalMsg = `You rolled the Point (${value}) — +${deltaScore} points! (Zero-Cycle bonus!)`
                new Audio('audio/Airhorn.mp3').play();
            } else {
                finalMsg = `You rolled the Point (${value}) — +100 points!`
                new Audio('audio/Tada.mp3').play();
            }
        } else if (losing.includes(value)) {
            nextLives = Math.max(0, lives - 1)
            finalMsg = `Rolled a ${value} \nlost 1 life.`
            new Audio('audio/Buzzer.mp3').play();
        } else {
            deltaScore = 10 // MAKE A FUNCTION CALL FOR THIS
            finalMsg = `Rolled ${value} — +10 points.`
            new Audio('audio/Cash.mp3').play();
            setZeroCycleActive(false)
            setRollCount(rollCount + 1)
            // continue the point cycle (do not end the point when neither the point nor losing values are rolled)
        }

        if (deltaScore) setScore((s) => s + deltaScore)
        if (dmg) setHp(nextHp)
        setLives(nextLives)

        // auto-end if HP or lives hit zero
        if (nextLives <= 0) {
            // end game; will be rendered via the ended screen
            setPhase('ended')
            return
        }
        if (nextHp <= 0) {
            setPhase('ended')
            return
        }

        // Do not change cycle or end the game immediately here. Show the result modal
        // and perform cycle increment / final end only after the player clicks Continue.
        setResultModal({ visible: true, text: finalMsg, allowEnd: false })
    }

    const handleResultContinue = () => {
        if (!resultModal.visible) return
        const val = lastEvaluated
        // close the result overlay
        setResultModal({ visible: false, text: '', allowEnd: false })
        setRawResult(null)
        setFinalResult(null)
        setAwaitingPost(false)
        // If this result was shown during a comeout (e.g. "rolled a 7 — roll again"),
        // simply dismiss the message and return to comeout.
        if (phase === 'comeout') {
            setShowPointModal(false)
            setLastRoll(null)
            return
        }

        // Otherwise we are in a point cycle — if this roll finished the cycle,
        // perform the cycle increment or end the game now (after the player clicked Continue).
        const diceCount = 2 + (cycle >= 3 ? 1 : 0) + (cycle >= 5 ? 1 : 0)
        const losing = getLosingValues(diceCount)
        const finished = val != null && (val === point || losing.includes(val))
        if (finished) {
            if (cycle >= 6) {
                setAllCyclesCompleted(true)
                setShowPointModal(false)
                setPhase('ended')
                return
            }
            // advance to next cycle after Continue
            setCycle((c) => c + 1)
            setPhase('comeout')
            setPoint(null)
            setShowPointModal(false)
            new Audio('audio/Swap.mp3').play();
            // reset comeout-losing tracking for the new comeout
            setComeoutLosingCount(0)
            setLastRoll(null)
            return
        }
        // otherwise keep the point modal visible and continue the cycle
    }

    const handleResultEnd = () => {
        setResultModal({ visible: false, text: '', allowEnd: false })
        setShowPointModal(false)
        setPhase('ended')
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

    function getLosingValues(diceCount: number) {
        if (diceCount === 2) return [7]
        if (diceCount === 3) return [10, 11]
        if (diceCount === 4) return [13, 14, 15]
        return [7]
    }

    const diceCount = 2 + (cycle >= 3 ? 1 : 0) + (cycle >= 5 ? 1 : 0)
    const minSum = Math.max(1, diceCount)
    const maxSum = diceCount * 6
    const NUMBERS = Array.from({ length: maxSum - minSum + 1 }, (_, i) => i + minSum)

    // format score as 8 digits with muted leading zeros
    const formattedScore = String(score).padStart(5, '0')
    const firstNonZero = formattedScore.search(/[^0]/) === -1 ? formattedScore.length : formattedScore.search(/[^0]/)

    // (end-screen rendering moved into the main return to avoid early-return hook mismatch)

    // handle redirects on end screen
    useEffect(() => {
        if (phase !== 'ended') return
        const grade = computeGrade()
        let t: any = null
        if (grade === 'SS') {
            // show message then redirect after 3s
            new Audio('audio/Tada.mp3').play();
            t = setTimeout(() => {
                try { window.location.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } catch (e) { try { window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank') } catch {} }
            }, 3000)
        } else if (grade === 'F') {
            new Audio('audio/Wompwomp.mp3').play();
            t = setTimeout(() => {
                try { window.location.href = 'https://www.youtube.com/watch?v=b1cTSxu8O8c' } catch (e) { try { window.open('https://www.youtube.com/watch?v=b1cTSxu8O8c', '_blank') } catch {} }
            }, 5000)
        }
        return () => { if (t) clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase])

    function computeGrade() {
        if (lives <= 0) return 'F'
        if (score > 2000 && allCyclesCompleted) return 'SS'
        if (score > 1500) return 'S'
        if (score > 1000) return 'A'
        if (score > 500) return 'B'
        return 'C'
    }

    // animate scoreboard digits using CSS ::before/::after slides
    useEffect(() => {
        const prev = prevScoreRef.current
        if (prev === score) return

        const prevDigits = String(prev).padStart(5, '0').split('')
        const targetDigits = String(score).padStart(5, '0').split('')

        // clear any running timers
        digitTimeoutsRef.current.forEach((id) => clearTimeout(id))
        digitTimeoutsRef.current = []

        // prepare pending target digits for ::after content
        pendingTargetDigitsRef.current = targetDigits

        // set which digits should animate
        const toAnimate = prevDigits.map((pd, i) => pd !== targetDigits[i])
        setAnimatingDigits(toAnimate)

        // keep current display as the previous digits until individual animations finish
        setDisplayDigits(prevDigits)

        // stagger stopping so digits settle left->right
        const base = 420
        for (let i = 0; i < targetDigits.length; i++) {
            if (!toAnimate[i]) continue
            const stopAfter = base + i * 80
            const t = window.setTimeout(() => {
                setDisplayDigits((s) => {
                    const copy = [...s]
                    copy[i] = targetDigits[i]
                    return copy
                })
                setAnimatingDigits((arr) => {
                    const copy = [...arr]
                    copy[i] = false
                    return copy
                })
            }, stopAfter)
            digitTimeoutsRef.current.push(t)
        }

        // final cleanup after all digits finished
        const finalTimer = window.setTimeout(() => {
            pendingTargetDigitsRef.current = null
            prevScoreRef.current = score
            setAnimatingDigits(Array(8).fill(false))
        }, base + targetDigits.length * 80 + 50)
        digitTimeoutsRef.current.push(finalTimer)

        return () => {
            digitTimeoutsRef.current.forEach((id) => clearTimeout(id))
            digitTimeoutsRef.current = []
            pendingTargetDigitsRef.current = null
        }
    }, [score])
    const rootClass = "game-root " + (phase === 'point' ? 'point-active' : '') + (phase === 'ended' ? ' ended' : '')

    return (
        <div className={rootClass}>
            {phase === 'ended' ? (
                <div className="final">
                    <div className="final-scoreboard">
                        {String(score).padStart(5, '0').split('').map((d, i) => (
                            <span key={i} className={"digit " + (i < firstNonZero ? 'muted' : '')}>{d}</span>
                        ))}
                        <span className="score-icon">💰</span>
                    </div>
                    <div className="meter">
                        <div className="meter-track">
                            <div className="meter-fill" style={{ width: `${Math.max(0, Math.min(100, Math.round((score / 2000) * 100)))}%` }} />
                            <div className="marker" style={{ left: `${Math.max(0, Math.min(100, Math.round((score / 2000) * 100)))}%` }}>{computeGrade()}</div>
                        </div>
                    </div>
                    <h3 className="grade-letter">{computeGrade()}</h3>
                </div>
            ) : (
                <>
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
                    {diceCount >= 3 && <Dice value={die3} rolling={rolling && die3 === 0} onClick={roll} faceAttr={faceAttrMap[die3]} />}
                    {diceCount >= 4 && <Dice value={die4} rolling={rolling && die4 === 0} onClick={roll} faceAttr={faceAttrMap[die4]} />}
                </div> <br/> <br/>

                {(phase === 'point' || comeoutLosingCount > 0) && (
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

                {/* single combined modal shown below the health bar (render whenever a modal state is active) */}
                {(showPointModal || resultModal.visible || awaitingPost) && (
                    <CombinedModal
                        point={point}
                        result={resultModal.visible ? { text: resultModal.text, allowEnd: resultModal.allowEnd } : null}
                        awaitingPost={awaitingPost}
                        raw={rawResult}
                        final={finalResult != null ? WORD_NUMBERS[finalResult] : null}
                        losing={getLosingValues(diceCount)}
                        postPlus={postPlus}
                        postMinus={postMinus}
                        onApply={applyPostAdjust}
                        onAccept={finalizeNoPost}
                        onResultContinue={handleResultContinue}
                        onResultEnd={handleResultEnd}
                    />
                )}

                <section className="bottom-panel">
                    <div className="numbers">
                        {NUMBERS.map((n) => {
                            const attr = numAttrMap[n]
                            const style: React.CSSProperties = {}
                            style.zIndex = 10
                            const losing = getLosingValues(diceCount)
                            // highlight the current point first
                            if (n === point) style.background = '#81e6d9'
                            else if (losing.includes(n)) {
                                if (phase === 'comeout') {
                                    // after first comeout losing roll, mark losing numbers purple
                                    if (comeoutLosingCount > 0) style.background = '#7c3aed'
                                    else style.background = '#81e6d9'
                                } else {
                                    style.background = '#ff6b6b'
                                }
                            }
                            if (attr && attr.color) style.background = attr.color
                            return (
                                <div key={n} className="num" style={style}>
                                    {lastRoll === n && <div className="v-marker">V</div>}
                                    <div className="num-label">{n}{attr && attr.label ? ` • ${attr.label}` : ''}</div>
                                </div>
                            )
                        })}
                    </div>


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

                <div className="scoreboard">
                    {displayDigits.map((d, i) => {
                        const oldDigit = d
                        const newDigit = pendingTargetDigitsRef.current ? pendingTargetDigitsRef.current[i] : d
                        const isRolling = animatingDigits[i]
                        return (
                            <span
                                key={i}
                                className={"digit " + (i < firstNonZero ? 'muted' : '') + (isRolling ? ' rolling' : '')}
                                data-old={oldDigit}
                                data-new={newDigit}
                                aria-label={`Score digit ${i + 1}`}
                            />
                        )
                    })}
                    <span className="score-icon">💰</span>
                </div>
                    </main>
                </>
            )}
            {cycle === 1 && phase !== 'ended' && <div className="intro">
                You have 6 cycles to make 7,000 budget. <br/>
                Clear the challenge, and roll into Yoshie's treasure trove. <br/>
                Run out of HP, and face the consequences of memery.
            </div>
            }
            {cycle === 3 && phase !== 'ended' && <div className="intro">
                Watch out, here comes another dice into play.
            </div>
            }
            {cycle === 5 && phase !== 'ended' && <div className="intro">
                One more dice! Hope you're almost there!
            </div>
            }


        </div>
    )
}

