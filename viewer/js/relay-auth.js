/* WHO MAY DRIVE THE VIEWER OVER THE PLANNER RELAY, AND WHERE ITS OWN POSTS MAY GO (relay authentication, 2026-10-03).

   Until this file the viewer acted on a {gen2:...} message from ANY sender and posted every label, option and palette to
   its opener/parent with target "*" - so any page that opened or framed the viewer received the user's build on their first
   edit, and any page holding a reference to the viewer could replace its layout (STEP3-CRITIQUE B14, STEP3-DESIGN R14).

   The rule, both directions, nothing else changed:
   - INCOMING: a relay message counts only when it comes from THE planner window (`plannerWin()` - the opener of a popped-out
     tab, the parent of the docked iframe; the same window every outgoing post already goes to) AND from an allowed origin:
     the production planner, plus loopback origins (any port) only while this viewer is itself served from loopback (dev).
   - OUTGOING: never "*". The target is the production planner origin; a dev viewer uses the origin it last heard the planner
     from, else its referrer's origin when that is a loopback origin, else the dev planner's default http://localhost:8124.
     A post to a window that is not on that origin is dropped by the browser - which is the point.

   Pure: the caller passes its own location, referrer and planner-window getter, so test/relay-contract.test.mjs runs it
   under node. main.js owns no origin logic of its own - keep it here. */

export const PLANNER_ORIGIN = 'https://gen2planner.jerrari3d.com';
export const DEV_PLANNER_ORIGIN = 'http://localhost:8124';   // serve-planner.py's default port
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export const isLoopbackPage = (loc) =>
  !!loc && loc.protocol === 'http:' && (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1');

export function plannerOriginAllowed(origin, selfLoc) {
  if (origin === PLANNER_ORIGIN) return true;
  return isLoopbackPage(selfLoc) && typeof origin === 'string' && LOOPBACK_ORIGIN.test(origin);
}

export function createPlannerRelay({ selfLoc, referrer, plannerWin }) {
  let heard = null;   // the origin the planner window last spoke from (only ever an allowed one)
  function guess() {
    if (!isLoopbackPage(selfLoc)) return PLANNER_ORIGIN;
    try { const o = new URL(referrer).origin; if (plannerOriginAllowed(o, selfLoc)) return o; } catch (e) { /* no referrer */ }
    return DEV_PLANNER_ORIGIN;
  }
  const relay = {
    /* true only for a message from THE planner window on an allowed origin; remembers that origin for the replies */
    trusted(e) {
      const w = plannerWin();
      if (!w || !e || e.source !== w || !plannerOriginAllowed(e.origin, selfLoc)) return false;
      heard = e.origin;
      return true;
    },
    target() { return heard || guess(); },
    /* the one way the viewer speaks to the planner; false when there is no planner window */
    post(msg) {
      const w = plannerWin();
      if (!w) return false;
      try { w.postMessage(msg, relay.target()); } catch (e) { return false; /* window gone */ }
      return true;
    },
  };
  return relay;
}
