"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <span className="eyebrow">SOMETHING INTERRUPTED YOUR VISIT</span>
      <h1>Let’s try that again.</h1>
      <p>Your saved work is still yours. Reload this view to continue.</p>
      <button onClick={reset} className="btn btn-primary">
        Try again
      </button>
    </main>
  );
}
