import type { MissionFileInfo, MissionId } from '../../lib/missions';
import Stamp from './Stamp';
import './spy.css';

/** One mission as a card: title, one pip per task, a one-line status, and a tag while it is open. A finished file is stamped. */
export default function MissionFile({ file, onOpen }: { file: MissionFileInfo; onOpen?(id: MissionId): void }) {
  return (
    <button type="button" className="spy-mission" onClick={() => onOpen?.(file.id)}>
      {file.complete && <Stamp text="Done" tone="quiet" />}
      <span className="spy-m-top">
        <span className="spy-m-title">{file.title}</span>
        {file.tag && !file.complete && <span className={`spy-tag spy-tag-${file.tag.tone}`}>{file.tag.text}</span>}
      </span>
      <span className="spy-pips" aria-hidden="true">{Array.from({ length: file.total }, (_, i) => <i key={i} className={i < file.done ? 'spy-on' : undefined} />)}</span>
      <span className="spy-m-sub">{file.status}</span>
    </button>
  );
}
