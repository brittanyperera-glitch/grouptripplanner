import './SubBack.css';

export default function SubBack({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="sb-back" onClick={onClick}>{`‹ ${label}`}</button>;
}
