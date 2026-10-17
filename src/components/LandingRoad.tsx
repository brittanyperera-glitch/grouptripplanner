import TukTuk from './TukTuk';
import '../screens/Landing.css';

/** The bottom road strip with the driving tuk-tuk, shared by the opening, the password gate and the intro. */
export default function LandingRoad() {
  return (
    <div className="landing-road" aria-hidden="true">
      <div className="landing-tuk"><TukTuk width={104} driving /></div>
    </div>
  );
}
