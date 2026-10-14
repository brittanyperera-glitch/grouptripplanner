import { useEffect } from 'react';

export default function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [text, onDone]);
  return <div className="toast" role="status">{text}</div>;
}
