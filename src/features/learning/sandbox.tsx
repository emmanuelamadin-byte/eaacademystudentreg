"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import { useAcademy } from "@/components/academy-provider";

export default function CodeSandbox({
  initialCode = "",
  lessonId,
}: {
  initialCode?: string;
  lessonId: string;
}) {
  const { user } = useAcademy();
  const codeKey = `ea:exercise:${user?.id}:${lessonId}`;
  const [code, setCode] = useState(initialCode);
  const [document, setDocument] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [review, setReview] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [tests, setTests] = useState("");
  const iframe = useRef<HTMLIFrameElement>(null);
  const token = useRef("");
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(codeKey);
      if (saved !== null) setCode(saved);
    } catch {}
  }, [codeKey]);
  const updateCode = (value: string) => {
    setCode(value);
    try {
      localStorage.setItem(codeKey, value);
    } catch {}
  };
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== iframe.current?.contentWindow ||
        event.data?.token !== token.current
      )
        return;
      if (event.data.type === "log")
        setOutput((previous) => [
          ...previous.slice(-199),
          String(event.data.text).slice(0, 5000),
        ]);
      if (event.data.type === "done") {
        setRunning(false);
        if (watchdog.current) clearTimeout(watchdog.current);
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      if (watchdog.current) clearTimeout(watchdog.current);
    };
  }, []);
  const run = (withTests = false) => {
    token.current = crypto.randomUUID();
    setOutput([]);
    setRunning(true);
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = setTimeout(() => {
      setRunning(false);
      setDocument("");
      setOutput((previous) => [
        ...previous,
        "Execution stopped. This browser could not finish the isolated run.",
      ]);
    }, 5000);
    const workerSource = `const format=v=>{try{return typeof v==='string'?v:JSON.stringify(v)??String(v)}catch{return String(v)}}; for(const level of ['log','warn','error','info','debug'])console[level]=(...args)=>postMessage({type:'log',text:(level==='log'?'':level.toUpperCase()+': ')+args.map(format).join(' ')}); onmessage=async e=>{try{await (new Function('return (async()=>{'+e.data+'\\n})()'))();postMessage({type:'done'})}catch(error){postMessage({type:'log',text:'ERROR: '+error.message});postMessage({type:'done'})}};`;
    const data = JSON.stringify({
      code: withTests ? `${code}\n${tests}` : code,
      workerSource,
      token: token.current,
    }).replace(/</g, "\\u003c");
    setDocument(
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none';"></head><body><script>const data=${data};const worker=new Worker(URL.createObjectURL(new Blob([data.workerSource],{type:'text/javascript'})));const send=message=>parent.postMessage({...message,token:data.token},'*');const timer=setTimeout(()=>{worker.terminate();send({type:'log',text:'Execution stopped after 3 seconds.'});send({type:'done'})},3000);worker.onmessage=e=>{send(e.data);if(e.data.type==='done'){clearTimeout(timer);worker.terminate()}};worker.onerror=e=>{send({type:'log',text:'ERROR: '+e.message});send({type:'done'});clearTimeout(timer);worker.terminate()};worker.postMessage(data.code);</script></body></html>`,
    );
  };
  const ask = async () => {
    setReviewing(true);
    setReview("");
    try {
      const result = await api<{ text: string }>("ai.ask", {
        mode: "review",
        lessonId,
        code,
        prompt:
          "Review this JavaScript exercise. Explain errors, suggest test cases and debugging hints. Do not assign an official grade.",
      });
      setReview(result.text);
    } catch (error) {
      setReview(
        error instanceof Error
          ? error.message
          : "The review could not be loaded.",
      );
    } finally {
      setReviewing(false);
    }
  };
  const generateTests = async () => {
    setReviewing(true);
    setReview("");
    try {
      const result = await api<{ tests: string; explanation: string }>(
        "ai.ask",
        {
          mode: "tests",
          lessonId,
          code,
          prompt: "Create a small executable test suite for this exercise.",
        },
      );
      setTests(result.tests);
      setReview(result.explanation);
    } catch (error) {
      setReview(
        error instanceof Error
          ? error.message
          : "Tests could not be generated.",
      );
    } finally {
      setReviewing(false);
    }
  };
  return (
    <section className="sandbox">
      <div className="learning-toolbar">
        <div>
          <h3>JavaScript workspace</h3>
          <p className="muted">
            Code runs in an isolated worker. Network access is disabled;
            execution is limited to 3 seconds.
          </p>
        </div>
        <div className="button-row">
          <button
            className="btn btn-secondary btn-small"
            onClick={() => {
              updateCode(initialCode);
              setOutput([]);
            }}
          >
            <RotateCcw size={15} /> Reset
          </button>
          <button
            className="btn btn-primary btn-small"
            disabled={running}
            onClick={() => run()}
          >
            <Play size={15} />
            {running ? "Running…" : "Run code"}
          </button>
        </div>
      </div>
      <div className="sandbox-grid">
        <label className="code-panel">
          <span>EDITOR · JAVASCRIPT</span>
          <textarea
            spellCheck={false}
            value={code}
            onChange={(event) => updateCode(event.target.value)}
            aria-label="JavaScript code editor"
            placeholder="Write JavaScript and use console.log() to inspect the result."
          />
        </label>
        <div className="console-panel">
          <span>CONSOLE</span>
          <pre aria-live="polite">
            {output.length
              ? output.join("\n")
              : running
                ? "Executing…"
                : "Run your code to see output here."}
          </pre>
        </div>
      </div>
      <iframe
        ref={iframe}
        sandbox="allow-scripts"
        srcDoc={document}
        title="Isolated JavaScript execution environment"
        hidden
      />
      <button
        className="btn btn-secondary"
        disabled={reviewing || !code.trim()}
        onClick={ask}
      >
        <Sparkles size={16} />
        {reviewing ? "Reviewing…" : "Get AI debugging hints"}
      </button>
      <button
        className="btn btn-secondary"
        disabled={reviewing || !code.trim()}
        onClick={generateTests}
      >
        <Sparkles size={16} /> Generate exercise tests
      </button>
      {tests && (
        <div className="ai-response">
          <label className="field">
            AI-generated tests (review and edit before running)
            <textarea
              rows={8}
              spellCheck={false}
              value={tests}
              onChange={(event) => setTests(event.target.value)}
            />
          </label>
          <button
            className="btn btn-primary btn-small"
            disabled={running}
            onClick={() => run(true)}
          >
            <Play size={15} /> Run code + tests
          </button>
          <p className="muted">
            Tests run in the isolated workspace. They are learning aids and do
            not determine your instructor rating.
          </p>
        </div>
      )}
      {review && (
        <div className="ai-response prose">
          <p className="eyebrow">AI feedback · advisory</p>
          <ReactMarkdown>{review}</ReactMarkdown>
        </div>
      )}
    </section>
  );
}
