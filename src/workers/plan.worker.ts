import { groupResult, personPlan } from '../lib/group';
import type { PlanRequest } from './usePlan';

self.onmessage = (e: MessageEvent<PlanRequest>) => {
  const req = e.data;
  const result = req.kind === 'person'
    ? personPlan(req.payload.resp, req.payload.items, req.payload.legs)
    : groupResult(req.payload.state, req.payload.items, req.payload.legs);
  self.postMessage({ id: req.id, result });
};
