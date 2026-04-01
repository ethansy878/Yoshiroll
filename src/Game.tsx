import React, { useEffect, useRef, useState } from 'react'
import './game.css'
import CombinedModal from './components/CombinedModal'
import DiceGrid from './components/DiceGrid'

type Attr = { label?: string; color?: string }

const bgm = new Audio('audio/Cosmicon.mp3')

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

function stormclamp(n: number) {
    if (n > 100)
        return 100
    return n
}

function waysToSum(sum: number, diceCount: number) {
    const max = diceCount * 6
    const dp: number[] = new Array(max + 1).fill(0)
    dp[0] = 1
    for (let d = 0; d < diceCount; d++) {
        const next = new Array(max + 1).fill(0)
        for (let s = 0; s <= max; s++) {
            const ways = dp[s]
            if (!ways) continue
            for (let face = 1; face <= 6; face++) {
                const ns = s + face
                if (ns <= max) next[ns] += ways
            }
        }
        for (let i = 0; i <= max; i++) dp[i] = next[i]
    }
    return dp[sum] || 0
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
            ) : value === 1 ? (
                <div className="yoshie-wrap" aria-hidden>
                    <img src="YoshieTrace.svg" alt="Yoshie" className="yoshie-face" />
                </div>
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
    const [prePlus, setPrePlus] = useState(10)
    const [preMinus, setPreMinus] = useState(10)
    const [postPlus, setPostPlus] = useState(3)
    const [postMinus, setPostMinus] = useState(3)

    // pending pre-adjust (can be >1 or < -1 to allow multiple pre-adds/subs)
    const [pendingPreAdjust, setPendingPreAdjust] = useState<number>(0)

    // Storm state: which numbers are currently stormy (text becomes purple + shaky)
    const [stormyMap, setStormyMap] = useState<Record<number, boolean>>({})

    // Per-number payout values and upgrade tracking
    const [numberValueMap, setNumberValueMap] = useState<Record<number, number>>(() => {
        const m: Record<number, number> = {}
        for (let i = 1; i <= 24; i++) m[i] = 5
        return m
    })
    const [numberUpgradeLevel, setNumberUpgradeLevel] = useState<Record<number, number>>({})

    // Shop buy counters (for scaling costs)
    const [preAddBought, setPreAddBought] = useState(0)
    const [preSubBought, setPreSubBought] = useState(0)
    const [postAddBought, setPostAddBought] = useState(0)
    const [postSubBought, setPostSubBought] = useState(0)

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

        const audio = new Audio('audio/Dice.mp3');
        audio.play();

        // decide pre-adjust and consume only if available (allow multiple uses)
        let usedPre = pendingPreAdjust
        if (usedPre > 0 && prePlus <= 0) usedPre = 0
        if (usedPre < 0 && preMinus <= 0) usedPre = 0
        // clamp to available counts
        if (usedPre > prePlus) usedPre = prePlus
        if (usedPre < -preMinus) usedPre = -preMinus

        if (usedPre > 0) setPrePlus((p) => Math.max(0, p - usedPre))
        if (usedPre < 0) setPreMinus((p) => Math.max(0, p - Math.abs(usedPre)))

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
                    setComeoutLosingCount(comeoutLosingCount + 1)
                    setScore(score + comeoutLosingCount)
                    if (comeoutDamageForCount(comeoutLosingCount) > 0)
                        new Audio('audio/Hit.wav').play()
                    setHp(hp - comeoutDamageForCount(comeoutLosingCount))
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
                    if (cycle === 1) bgm.play()
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
        setPendingPreAdjust(0)
        // remember value for later continue/end decisions
        setLastEvaluated(value)
        // reflect the evaluated value (including post-adjust edits) in the V marker
        setLastRoll(value)
        const diceCount = 2 + (cycle >= 3 ? 1 : 0) + (cycle >= 5 ? 1 : 0)
        const losing = getLosingValues(diceCount)

        // storm damage: depends on how many previous continuing rolls have occurred
        let stormDamage = 0
        if (rollCount == 2) new Audio('audio/Storm.mp3').play();
        if (rollCount >= 3 && stormyMap[value]) {
            stormDamage = Math.pow(2, Math.max(0, rollCount - 3))
            if (stormDamage >= 128) stormDamage = 100
        }

        const baseDmg = hpDamageMap[value] || 0
        let totalDmg = baseDmg + stormDamage
        const nextHp = Math.max(0, hp - totalDmg)
        let nextLives = lives
        let deltaScore = 0
        let finalMsg = ''

        if (value === point) {
            const waysVal = waysToSum(value, diceCount)
            const losingVals = getLosingValues(diceCount)
            const waysLosing = losingVals.reduce((acc, lv) => acc + waysToSum(lv, diceCount), 0)
            const odds = waysVal > 0 ? (waysLosing / waysVal) : 0
            const baseVal = numberValueMap[value] || 5
            const payout = Math.floor(baseVal * odds)
            const bonus = (cycle * 200)
            deltaScore = payout > 0 ? (payout + bonus) : 10
            setRollCount(0)
            setStormyMap({})
            totalDmg = 0
            // Zero-Cycle bonus: extra 100 if this point was set on the very first roll
            if (zeroCycleActive) {
                deltaScore  = deltaScore * 2
                setZeroCycleActive(false)
                finalMsg = `POINT ${WORD_NUMBERS[value]} SECURED — +${payout * 2} budget, +${bonus * 2} bonus (Zero-Cycle - X2)`
                new Audio('audio/Airhorn.mp3').play();
            } else {
                finalMsg = `POINT ${WORD_NUMBERS[value]} SECURED — +${payout} budget, +${bonus} bonus`
                new Audio('audio/Tada.mp3').play();
            }
        } else if (losing.includes(value)) {
            nextLives = Math.max(0, lives - 1)
            finalMsg = `${WORD_NUMBERS[value]} — LIFE LOST`
            new Audio('audio/Buzzer.mp3').play();
        } else {
            // dynamic payout based on per-number value and odds vs rolling the losing value(s)
            const waysVal = waysToSum(value, diceCount)
            const losingVals = getLosingValues(diceCount)
            const waysLosing = losingVals.reduce((acc, lv) => acc + waysToSum(lv, diceCount), 0)
            const odds = waysVal > 0 ? (waysLosing / waysVal) : 0
            const baseVal = numberValueMap[value] || 5
            const payout = Math.floor(baseVal * odds)
            deltaScore = payout > 0 ? payout : 10
            finalMsg = `${WORD_NUMBERS[value]} — +${deltaScore} budget`
            new Audio('audio/Cash.mp3').play();
            setZeroCycleActive(false)
            setRollCount((r) => r + 1)
            // continue the point cycle (do not end the point when neither the point nor losing values are rolled)
        }

        if (deltaScore) setScore((s) => s + deltaScore)
        if (totalDmg) {setHp(nextHp); new Audio('audio/Hit.wav').play(); }

        if (nextHp <= 0) {
            nextLives = Math.max(0, lives - 1)
            setHp(100);
            new Audio('audio/Revive.mp3').play();
        }

        setLives(nextLives)

        if (nextLives <= 0) {
            // end game; will be rendered via the ended screen
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
                allCyclesCompleted;
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
            if (cycle === 2 || cycle === 4) new Audio('audio/NewDice.mp3').play();
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

    const buyNumberUpgrade = (n: number) => {
        const lvl = numberUpgradeLevel[n] || 0
        const cost = 5 * Math.pow(2, lvl)
        if (score < cost) return
        setScore((s) => s - cost)
        new Audio('audio/Buy.mp3').play()
        setNumberUpgradeLevel((prev) => ({ ...prev, [n]: lvl + 1 }))
        setNumberValueMap((prev) => ({ ...prev, [n]: (prev[n] || 5) + cost }))
    }

    const buyPreAdd = () => {
        const cost = 5 * Math.pow(2, preAddBought)
        if (score < cost) return
        setScore((s) => s - cost)
        new Audio('audio/Buy.mp3').play()
        setPreAddBought((b) => b + 1)
        setPrePlus((p) => p + 1)
    }
    const buyPreSub = () => {
        const cost = 5 * Math.pow(2, preSubBought)
        if (score < cost) return
        setScore((s) => s - cost)
        new Audio('audio/Buy.mp3').play()
        setPreSubBought((b) => b + 1)
        setPreMinus((p) => p + 1)
    }
    const buyPostAdd = () => {
        const cost = 100 * Math.pow(2, postAddBought)
        if (score < cost) return
        setScore((s) => s - cost)
        new Audio('audio/Buy.mp3').play()
        setPostAddBought((b) => b + 1)
        setPostPlus((p) => p + 1)
    }
    const buyPostSub = () => {
        const cost = 100 * Math.pow(2, postSubBought)
        if (score < cost) return
        setScore((s) => s - cost)
        new Audio('audio/Buy.mp3').play()
        setPostSubBought((b) => b + 1)
        setPostMinus((p) => p + 1)
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
        if (diceCount === 4) return [12, 14, 16]
        return [7]
    }

    const diceCount = 2 + (cycle >= 3 ? 1 : 0) + (cycle >= 5 ? 1 : 0)
    const minSum = Math.max(1, diceCount)
    const maxSum = diceCount * 6
    const NUMBERS = Array.from({ length: maxSum - minSum + 1 }, (_, i) => i + minSum)

    const preAddCost = 10 + 2 * preAddBought
    const preSubCost = 10 + 2 * preSubBought
    const postAddCost = 50 * Math.pow(2, postAddBought)
    const postSubCost = 50 * Math.pow(2, postSubBought)

    // format score as 8 digits with muted leading zeros
    const formattedScore = String(score).padStart(5, '0')
    const firstNonZero = formattedScore.search(/[^0]/) === -1 ? formattedScore.length : formattedScore.search(/[^0]/)

    // (end-screen rendering moved into the main return to avoid early-return hook mismatch)

    // handle redirects on end screen
    useEffect(() => {
        if (phase !== 'ended') return
        bgm.pause()
        const grade = computeGrade()
        let t: any = null
        if (grade === 'S') {
            // show message then redirect after 3s
            new Audio('audio/Tada.mp3').play();
            t = setTimeout(() => {
                try { window.location.href = 'https://www.youtube.com/watch?v=yPYZpwSpKmA' } catch (e) { try { window.open('https://www.youtube.com/watch?v=yPYZpwSpKmA', '_blank') } catch {} }
            }, 3000)
        } else {
            new Audio('audio/Wompwomp.mp3').play();
            t = setTimeout(() => {
                try { window.location.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } catch (e) { try { window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank') } catch {} }
            }, 5000)
        }
        return () => { if (t) clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase])

    function computeGrade() {
        if (lives <= 0) return 'X'
        if (score > 10000) return 'S'
        if (score > 8000) return 'A'
        if (score > 6000) return 'B'
        if (score > 4000) return 'C'
        if (score > 2000) return 'D'
        return 'F'
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
            setAnimatingDigits(Array(5).fill(false))
        }, base + targetDigits.length * 80 + 50)
        digitTimeoutsRef.current.push(finalTimer)

        return () => {
            digitTimeoutsRef.current.forEach((id) => clearTimeout(id))
            digitTimeoutsRef.current = []
            pendingTargetDigitsRef.current = null
        }
    }, [score])

    // update stormy numbers based on roll progress within the current point cycle
    useEffect(() => {
        const diceCountForCycle = 2 + (cycle >= 3 ? 1 : 0) + (cycle >= 5 ? 1 : 0)
        const minSum = Math.max(1, diceCountForCycle)
        const maxSum = diceCountForCycle * 6
        const losing = getLosingValues(diceCountForCycle)

        // number of extreme pairs that should be active. After the 3rd continuing roll,
        // the first pair (min/max) becomes stormy; each subsequent continuing roll
        // activates the next inward pair.
        const activatedPairs = Math.max(0, rollCount - 2)
        const map: Record<number, boolean> = {}
        for (let n = minSum; n <= maxSum; n++) map[n] = false
        for (let i = 0; i < activatedPairs; i++) {
            const low = minSum + i
            const high = maxSum - i
            if (!losing.includes(low)) map[low] = true
            if (!losing.includes(high)) map[high] = true
        }
        setStormyMap(map)
    }, [rollCount, cycle, phase])
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
                            <div className="meter-fill" style={{ width: `${Math.max(0, Math.min(100, Math.round((score / 10000) * 100)))}%` }} />
                        </div>
                    </div>
                    <h3 className="grade-letter">Rating: {computeGrade()}</h3>
                    {computeGrade() !== 'S' && computeGrade() !== 'X' && <div className="intro">Good job, but not enough funds for Yoshie. Teleporting in 5 seconds...</div>}
                    {computeGrade() === 'X' && <div className="intro">YOU DIED... Teleporting in 5 seconds...</div>}
                    {computeGrade() === 'S' && <div className="intro">YOU CLEARED THE CHALLENGE! Teleporting in 5 seconds...</div>}
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
                <h1 className="main-title">{phase === 'comeout' ? 'Yoshiroll.' : `Cycle ${cycle}`}</h1> <br/>

                <div className="dice-row">
                    <Dice value={die1} rolling={rolling && die1 === 0} onClick={roll} faceAttr={faceAttrMap[die1]} />
                    <Dice value={die2} rolling={rolling && die2 === 0} onClick={roll} faceAttr={faceAttrMap[die2]} />
                    {diceCount >= 3 && <Dice value={die3} rolling={rolling && die3 === 0} onClick={roll} faceAttr={faceAttrMap[die3]} />}
                    {diceCount >= 4 && <Dice value={die4} rolling={rolling && die4 === 0} onClick={roll} faceAttr={faceAttrMap[die4]} />}
                </div>
                {phase === 'point' && !awaitingPost && !rolling && !resultModal.visible && <div className="intro">
                    CLICK DICE TO ROLL <br/><br/>
                </div> }

            {phase === 'point' && <div className="pre-adjust-display">{pendingPreAdjust >= 0 ? `+${pendingPreAdjust}` : pendingPreAdjust}</div>}
            {phase === 'point' && !rolling && !awaitingPost && !resultModal.visible && <div className="controls">
                    <div className="pre-controls">
                        <label className="pre-label">Stack Pre-Adjusts</label>
                        <div className="post-actions">
                            <button onClick={() => setPendingPreAdjust((p) => Math.min(p + 1, prePlus))} disabled={prePlus <= 0}>+1 (x{prePlus})</button>
                            <button onClick={() => setPendingPreAdjust((p) => Math.max(p - 1, -preMinus))} disabled={preMinus <= 0}>-1 (x{preMinus})</button>
                            <button onClick={() => setPendingPreAdjust(0)}>Clear</button>
                        </div>
                    </div>
                </div> }

                <br/> <br/>

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
                            const isStorm = !!stormyMap[n]
                            const isUpgradeable = phase === 'comeout' && cycle >= 2 && !losing.includes(n)
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

                            const displayValue = numberValueMap[n] || 5
                            return (
                                <div
                                    key={n}
                                    className={"num" + (isUpgradeable ? ' clickable' : '')}
                                    style={style}
                                    onClick={() => { if (isUpgradeable) buyNumberUpgrade(n) }}
                                >
                                    {lastRoll === n && <div className="v-marker">V</div>}
                                    <div className={"num-label" + (isStorm ? ' stormy' : '')}>
                                        {n}{attr && attr.label ? ` • ${attr.label}` : ''}
                                    </div>
                                    {!losing.includes(n) && <div className="num-value">Lv. {Math.log(displayValue / 5) / Math.log(2) + 1}</div>}
                                    {cycle > 1 && !losing.includes(n) && phase === 'comeout' && <div className="num-value">{displayValue}💰</div>}
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

                {phase === 'point' && rollCount >= 3 && <div className="intro storm"> STORM DAMAGE: {stormclamp(Math.pow(2, Math.max(0, rollCount - 3)))}% </div>}

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
            {score > 99999 && <div className="intro">
                Wow! You have over 99,999 budget! The scoreboard may not function as expected! <br/>
            </div>
            }
            {cycle === 1 && phase !== 'ended' && <div className="intro">
                You have 6 cycles to make 10,000 budget. <br/>
                Clear the challenge, and get blessed by Yoshie. <br/>
                Lose your 3 lives, and get memed. <br/>
                (Volume Warning: Turn your sound DOWN)
            </div>
            }
            {cycle >= 2 && phase === 'comeout' && <div className="intro">
                Click the numbers to upgrade them. <br/>
                Purchase adds and subs below:
            </div>
            }
            {cycle >= 2 && phase == 'comeout' && <div className="shop">
                <button onClick={buyPreAdd} disabled={score < preAddCost}>Buy a Pre-Add (x{prePlus}) — {preAddCost}💰</button>
                <button onClick={buyPreSub} disabled={score < preSubCost}>Buy a Pre-Sub (x{preMinus}) — {preSubCost}💰</button>
                <button onClick={buyPostAdd} disabled={score < postAddCost}>Buy a Post-Add (x{postPlus}) — {postAddCost}💰</button>
                <button onClick={buyPostSub} disabled={score < postSubCost}>Buy  Post-Sub (x{postMinus}) — {postSubCost}💰</button>
            </div>}
            {cycle === 3 && phase !== 'ended' && <div className="intro">
                Watch out! Another dice comes into play.
            </div>
            }
            {cycle === 5 && phase !== 'ended' && <div className="intro">
                One more dice! Good luck!
            </div>
            }


        </div>
    )
}

