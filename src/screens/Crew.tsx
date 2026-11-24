import SubBack from '../components/SubBack';
import { allSubmitted } from '../lib/group';
import type { SubId } from '../lib/todo';
import { useApp } from '../state';
import type { GroupResult } from '../types';
import Complaints from './Complaints';
import Everyone from './Everyone';
import Extras from './Extras';
import Friends from './Friends';
import GroupAnswers from './GroupAnswers';

export type CrewWhich = Extract<SubId, 'crew-stats' | 'crew-decided' | 'complaints'>;

/** The Crew sub-screens under Me: the shared Back over one existing screen. Extras needs the group result, so it shows only when `group` is given. */
export default function CrewPage({ which, back, backLabel, group }: { which: CrewWhich; back: () => void; backLabel: string; group?: GroupResult }) {
  const { state } = useApp();
  const submitted = allSubmitted(state.responses);
  return (
    <>
      <div className="body"><SubBack label={backLabel} onClick={back} /></div>
      {which === 'crew-stats' && <Friends />}
      {which === 'crew-decided' && (
        <>
          <GroupAnswers />
          <Everyone open={submitted} />
          {group && <Extras group={group} />}
        </>
      )}
      {which === 'complaints' && <Complaints>{null}</Complaints>}
    </>
  );
}
