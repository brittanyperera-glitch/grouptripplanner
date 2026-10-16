// Quiz copy. Source: approved "Quiz" section of the stays copy draft (2026-10-16).
// Strings marked NEW are not in that draft (functional labels or extra host lines) and need Brittany's eye.
import type { Guest } from '../types';

export type Opt = [key: string, label: string, hint?: string];

export interface CardCopy {
  host: Guest;
  ask: string;
  hint?: string;
  idle: string; // host line before anything is picked (NEW except where noted)
  picked: string; // host line after any chip without its own line (NEW)
  opts: Opt[];
}

export const STAY: Opt[] = [
  ['hostel', 'Hostel dorm', 'cheap, social'],
  ['guesthouse', 'Guesthouse', 'homely, local'],
  ['boutique', 'Boutique', 'pretty, a bit pricey'],
  ['hotel', 'Hotel', 'comfy, pool'],
  ['villa', 'Villa', 'whole place to ourselves'],
];

export const CARD_COPY: Record<'stayType' | 'rooms' | 'budget' | 'transport' | 'journey' | 'nos', CardCopy> = {
  stayType: {
    host: 'Aunty', ask: 'Where are you willing to lay your head?',
    idle: 'Come, sit. Tell Aunty what you like.', picked: 'Mm, noted. Aunty remembers everything.', opts: STAY,
  },
  rooms: {
    host: 'Aunty', ask: 'And who are you sharing a room with?',
    idle: 'Who is snoring next to you?', picked: 'Aunty has opinions, but fine.',
    opts: [['dorm', 'Dorm bunk'], ['shared', 'Shared room'], ['private', 'Own room']],
  },
  budget: {
    host: 'Groom', ask: 'What do you pay a night?', hint: 'Per person, in pounds.',
    idle: 'Groom is counting. Gently.', picked: 'Groom writes it down.',
    opts: [['under10', 'Under 10'], ['10to20', '10 to 20'], ['20to35', '20 to 35'], ['35to55', '35 to 55'], ['55to85', '55 to 85'], ['85plus', '85 plus']],
  },
  transport: {
    host: 'Tuktuk', ask: 'How are we getting around?',
    idle: 'Tuktuk knows every road. Mostly.', picked: 'Good choice. Mostly.',
    opts: [['train', 'Train'], ['driver', 'Private driver'], ['tuktuk', 'Tuk-tuk'], ['bus', 'Bus'], ['taxi', 'Taxi'], ['selfdrive', 'Self-drive']],
  },
  journey: {
    host: 'Tuktuk', ask: 'Longest drive before you start complaining?',
    idle: 'Be honest. How long is too long?', picked: 'Fine. We will stop for snacks.',
    opts: [['under2h', 'Under 2 hours'], ['2to3h', '2 to 3 hours'], ['3to4h', '3 to 4 hours'], ['bigday', 'Big days are fine']],
  },
  nos: {
    host: 'Groom', ask: 'Any dealbreakers? Things you would never do on this trip.',
    idle: 'Any lines we must not cross?', picked: 'Noted. Groom keeps the list.',
    opts: [['dorm', 'Dorm beds'], ['sharedbath', 'Shared bathroom'], ['overnight', 'Overnight journeys'], ['noac', 'No air con']],
  },
};

export const STRETCH_ASK = "Most you'd stretch to for somewhere special?";
export const STRETCH: Opt[] = [['same', 'Same'], ['plus20', '+20'], ['plus50', '+50'], ['anything', 'Anything']];

// Host lines for a specific chip, keyed `${topic}:${key}`.
export const QUIPS: Record<string, string> = {
  'rooms:dorm': 'A dorm. Very brave. Pack earplugs.',
  'stayType:hostel': 'A hostel. Bunk beds and new friends.',
  'stayType:villa': 'A whole villa. Aunty approves.',
  'transport:bus': 'Bus it is. Hold on to something.',
  'transport:tuktuk': 'Tuk-tuk. Hold your hat.',
  'budget:85plus': 'A big spender. Noted.',
  'budget:stretch:anything': 'Anything? Groom is nervous.',
  'nos:overnight': 'No night trains. Fair enough.',
};

export const COPY = {
  banner: 'Only counts are shown. Nobody sees who said what.',
  legend: "Tap once if you're up for it. Twice if it's a no way.",
  skip: 'Skip, no answer',
  noPref: "No preference, I'm easy",
  none: "None, I'm easy",
  anonymous: 'anonymous',
  next: 'Next',
  done: 'Done',
  close: 'Close',
  back: 'Back',
  startAgain: 'Start again',
  confirmAsk: 'Clear all your answers?',
  confirmYes: 'Yes, start again',
  confirmNo: 'Keep going',
  nightsUpTo: 'up to',
  nightsAny: 'any',
  nightsUnit: 'nights',
  reveal: {
    kicker: 'Your travel personality',
    private: 'The group only sees counts, never names.',
    happy: 'Up for',
    noway: 'No way',
    nothing: 'Nothing yet',
    cta: 'Done',
  },
  titles: {
    backpacker: 'The Budget Backpacker',
    comfort: 'The Comfort Seeker',
    local: 'The Local Legend',
    spender: 'The Big Spender',
    easy: 'The Easygoing One',
  },
};

export const PERSONALITY_TITLES = Object.values(COPY.titles);
