import { useRef, useState } from 'react';
import { DEMO_STEPS, KUNSTWERK_ID, type DemoCtx } from '../demo/script';
import { useToast } from '../lib/toast';

type Status = 'idle' | 'running' | 'done' | 'error';

export function DemoScript({ onArrows }: { onArrows: (arrows: string[]) => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [running, setRunning] = useState(false);
  const ctxRef = useRef<DemoCtx>({ kunstwerkId: KUNSTWERK_ID });

  const runStep = async (n: number): Promise<boolean> => {
    const step = DEMO_STEPS.find(s => s.n === n)!;
    setStatus(s => ({ ...s, [n]: 'running' }));
    onArrows(step.arrows);
    try {
      const msg = await step.run(ctxRef.current);
      setStatus(s => ({ ...s, [n]: 'done' }));
      setMessages(m => ({ ...m, [n]: msg }));
      toast.push('success', `Stap ${n} ✓`, msg);
      return true;
    } catch (e) {
      setStatus(s => ({ ...s, [n]: 'error' }));
      const msg = (e as Error).message;
      setMessages(m => ({ ...m, [n]: msg }));
      toast.push('error', `Stap ${n} ✗`, msg);
      return false;
    } finally {
      setTimeout(() => onArrows([]), 1500);
    }
  };

  const runAll = async () => {
    setRunning(true);
    ctxRef.current = { kunstwerkId: KUNSTWERK_ID };
    setStatus({});
    setMessages({});
    for (const step of DEMO_STEPS) {
      const ok = await runStep(step.n);
      // Stap 11 hoort "te falen" maar wordt intern als done gerapporteerd; alle
      // andere fouten stoppen de gouden route.
      if (!ok) break;
    }
    setRunning(false);
  };

  const reset = () => {
    ctxRef.current = { kunstwerkId: KUNSTWERK_ID };
    setStatus({});
    setMessages({});
  };

  const icon = (st: Status | undefined) =>
    st === 'done' ? '✓' : st === 'error' ? '✗' : st === 'running' ? '⏳' : '○';

  return (
    <div className="demo">
      <div className="demo__controls">
        <button className="btn btn--primary" onClick={runAll} disabled={running}>
          {running ? 'Demo loopt…' : '▶ Start gouden route (1→11)'}
        </button>
        <button className="btn" onClick={reset} disabled={running}>Reset</button>
        <span className="demo__kw">kunstwerk: <code>{KUNSTWERK_ID}</code></span>
      </div>
      <ol className="demo__steps">
        {DEMO_STEPS.map(step => {
          const st = status[step.n];
          return (
            <li key={step.n} className={`demo__step demo__step--${st ?? 'idle'}`}>
              <button
                className="demo__step-btn"
                onClick={() => runStep(step.n)}
                disabled={running || st === 'running'}
                title="Los afvuren"
              >
                <span className="demo__step-icon">{icon(st)}</span>
                <span className="demo__step-n">{step.n}</span>
                <span className="demo__step-title">{step.title}</span>
              </button>
              {messages[step.n] && <div className="demo__step-msg">{messages[step.n]}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
