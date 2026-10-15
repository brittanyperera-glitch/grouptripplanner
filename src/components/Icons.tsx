import type { ReactNode, SVGProps } from 'react';

// Small stroke icons on a 24px grid. Decorative: the control next to them carries the name.
function Svg({ children, size = 20, ...rest }: SVGProps<SVGSVGElement> & { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

type P = { size?: number; className?: string };

export const IconRoute = (p: P) => <Svg {...p}><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5" /></Svg>;
export const IconGroup = (p: P) => <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18.5 14.5A6.5 6.5 0 0 1 21.5 20" /></Svg>;
export const IconGrid = (p: P) => <Svg {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></Svg>;
export const IconSpark = (p: P) => <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></Svg>;
export const IconUp = (p: P) => <Svg {...p}><path d="M6 15l6-6 6 6" /></Svg>;
export const IconDown = (p: P) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const IconLeft = (p: P) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const IconRight = (p: P) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const IconTicket = (p: P) => <Svg {...p}><path d="M3.5 8.5V6.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2a2.5 2.5 0 0 0 0 5v2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2a2.5 2.5 0 0 0 0-5z" /><path d="M14 6v12" strokeDasharray="2 2.5" /></Svg>;
export const IconSun = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></Svg>;
export const IconPin = (p: P) => <Svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></Svg>;
export const IconCar = (p: P) => <Svg {...p}><path d="M5 16.5V12l2-5h10l2 5v4.5" /><path d="M3.5 16.5h17" /><circle cx="7.5" cy="16.5" r="1.8" /><circle cx="16.5" cy="16.5" r="1.8" /><path d="M5 12h14" /></Svg>;
export const IconTrain = (p: P) => <Svg {...p}><rect x="6" y="3.5" width="12" height="13" rx="3" /><path d="M6 10.5h12M9 20l-2 1.5M15 20l2 1.5M9.5 13.5h.01M14.5 13.5h.01" /></Svg>;
export const IconWarn = (p: P) => <Svg {...p}><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></Svg>;
export const IconExternal = (p: P) => <Svg {...p}><path d="M14 4.5h5.5V10M19.5 4.5L11 13M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10" /></Svg>;
export const IconThumb = (p: P) => <Svg {...p}><path d="M7 10.5v9.5H4.5a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1z" /><path d="M7 10.5l3.6-6.3a1.9 1.9 0 0 1 3.5 1.3l-.8 3.9h5.2a2 2 0 0 1 2 2.3l-1.2 6.7a2 2 0 0 1-2 1.6H7" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconMinus = (p: P) => <Svg {...p}><path d="M6 12h12" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 6v12M6 12h12" /></Svg>;
export const IconInfinity = (p: P) => <Svg {...p}><path d="M12 12c-2-3-3.5-4.5-5.5-4.5a4.5 4.5 0 0 0 0 9c2 0 3.5-1.5 5.5-4.5s3.5-4.5 5.5-4.5a4.5 4.5 0 0 1 0 9c-2 0-3.5-1.5-5.5-4.5z" /></Svg>;
export const IconCalendar = (p: P) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Svg>;
export const IconList = (p: P) => <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></Svg>;
export const IconBook = (p: P) => <Svg {...p}><path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h10.5" /></Svg>;
export const IconRain = (p: P) => <Svg {...p}><path d="M7 15a4.5 4.5 0 1 1 1.2-8.8A5.5 5.5 0 0 1 18.5 9 3 3 0 0 1 17.5 15z" /><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" /></Svg>;
