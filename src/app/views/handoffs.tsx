"use client";
import { CodeBlock } from "../components/code-block";
import { FixFrame } from "./fix-shared";

export function HandoffsView() {
  return (
    <FixFrame loadingLabel="Building handoff">
      {(f, t) => (
        <div className="space-y-3">
          <p className="text-sm text-muted">A self-contained brief for <span className="font-mono">{f.file}:{f.line}</span>: the finding, evidence, the recommended patch and how to verify it.</p>
          <CodeBlock title="Handoff brief (markdown)" code={t.handoff} maxHeight="32rem" />
        </div>
      )}
    </FixFrame>
  );
}
