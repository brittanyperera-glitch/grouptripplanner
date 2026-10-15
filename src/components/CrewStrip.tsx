import { PEOPLE } from '../types';

/** The five selfies in a row, for the top of the results tab. */
export default function CrewStrip() {
  return (
    <ul className="crew" aria-label="The crew">
      {PEOPLE.map(p => (
        <li key={p}>
          <img src={`/img/players/${p.toLowerCase()}-selfie.png`} alt={`${p} selfie`} loading="lazy" />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}
