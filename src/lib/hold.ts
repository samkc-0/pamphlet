// Press-and-hold interactions all use one duration, and the fill that
// shows while holding is driven from that same number - so an indicator
// reaching full is exactly the moment the action fires, rather than the
// two drifting apart if either is tweaked.
export const LONG_PRESS_MS = 550;

// Two presentations of the same idea: an icon fills its own glyph, and a
// run of text fills behind itself (see .hold-fill / .hold-fill-bg).
export const holdFillStyle = { animationDuration: `${LONG_PRESS_MS}ms` };
