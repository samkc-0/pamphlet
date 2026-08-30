// "Menu tier" glass, per https://github.com/stormaref/LiquidGlassSkill: heavy
// blur + a translucent wash of the popover's own surface, no refraction
// directive. Full refraction needs a colorful backdrop to bend — this popup
// floats over plain reader text, which has none, so it'd just render flat.
//
// Tuned lower-opacity than the skill's own default so the blurred text
// behind stays visibly legible-but-blurred (the clearest "this is glass, not
// a card" cue on a plain page), with a brighter three-part bezel highlight
// (bright top edge, thin all-around hairline, faint bottom edge) and a hint
// of chromatic fringe at the rim.
export const GLASS_PANEL_CLASSNAME =
  "glass-pop-in rounded-2xl border border-white/40 bg-white/25 shadow-[0_16px_40px_rgba(20,22,30,0.18),0_4px_12px_rgba(20,22,30,0.08),inset_0_1.5px_0_rgba(255,255,255,0.9),inset_0_0_0_1px_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(56,189,248,0.15)] backdrop-blur-lg backdrop-saturate-[1.8] dark:border-white/15 dark:bg-neutral-900/35 dark:shadow-[0_20px_48px_rgba(0,0,0,0.6),0_4px_14px_rgba(0,0,0,0.4),inset_0_1.5px_0_rgba(255,255,255,0.2),inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(56,189,248,0.1)]";
