import LandingRoad from '../components/LandingRoad';
import './Landing.css';

/** Entry screen: the Group Trip Hero postcard, with the trip and guest doors. */
export default function Landing({ onTrip, onGuest }: { onTrip(): void; onGuest(): void }) {
  return (
    <div className="intro landing">
      <main className="landing-body">
        <div className="landing-top">
          <p className="landing-stamp"><span>Postcard</span><span>Sri Lanka</span></p>
          <h1 className="landing-title"><span>Group</span> <span>Trip</span> <span>Hero</span></h1>
          <p className="landing-trip">Sri Lanka: The Homecoming</p>
        </div>
        <div className="landing-cards">
          <button type="button" className="landing-card primary" onClick={onTrip}>
            <span className="landing-h">I'm on the trip</span>
            <span className="landing-sub">Use your trip password</span>
          </button>
          <button type="button" className="landing-card" onClick={onGuest}>
            <span className="landing-h">Try it as a guest</span>
            <span className="landing-sub">Look around. Nothing you do is saved.</span>
          </button>
        </div>
      </main>
      <LandingRoad />
    </div>
  );
}
