import { describe, expect, it } from 'vitest';
import { ServerLike } from './__fixtures__/serverLike';
import { WriteQueue } from './queue';
import { emptyRanking } from '../types';

const hooks = { onFail() {}, onClear() {} };
const R = { ...emptyRanking(), must: [['a', 'b']] };
const FIN = { ...emptyRanking(), must: [['b'], ['a']] };

// The fixture stands in for the live responses table, so it must keep final where the real columns do.
describe('ServerLike responses, through the write queue', () => {
  it('a ranking-only save after Finalize keeps the final list', async () => {
    const base = new ServerLike();
    const q = new WriteQueue(base, hooks);
    await q.store.saveResponse('Alex', { ranking: R, final: FIN, submitted: true });
    await q.store.saveResponse('Alex', { ranking: R, days: 9 });
    expect(base.rows.Alex).toMatchObject({ ranking: R, final: FIN, days: 9, submitted: true });
  });

  it('a final-only save is stored over the existing ranking', async () => {
    const base = new ServerLike();
    const q = new WriteQueue(base, hooks);
    await q.store.saveResponse('Alex', { ranking: R, submitted: true });
    await q.store.saveResponse('Alex', { final: FIN });
    expect(base.rows.Alex).toMatchObject({ ranking: R, final: FIN });
  });
});
