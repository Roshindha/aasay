import { Fragment } from "react";

/** Renders `backticked` segments as inline code instead of showing the backticks. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.92em]">{p}</code> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}
