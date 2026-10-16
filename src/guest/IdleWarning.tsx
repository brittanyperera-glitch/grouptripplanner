import './IdleWarning.css';

export function IdleWarning({ onStay, onFinish }: { onStay(): void; onFinish(): void }) {
  return (
    <div className="idle-warn">
      <div className="idle-warn-card" role="alertdialog" aria-modal="true" aria-labelledby="idle-warn-title">
        <h2 id="idle-warn-title" className="idle-warn-title">Still there?</h2>
        <p className="idle-warn-body">This will start over soon.</p>
        <button type="button" className="idle-warn-btn idle-warn-stay" onClick={onStay}>I'm still here</button>
        <button type="button" className="idle-warn-btn idle-warn-finish" onClick={onFinish}>Finish now</button>
      </div>
    </div>
  );
}
