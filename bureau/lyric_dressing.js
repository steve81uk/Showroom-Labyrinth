// =====================================================================================================================
// LYRIC SET DRESSING: the lyrics design the store. Each entry is keyed to a sung line (matched by text, never by a
// hard-coded frame), placed where Wolfgang is when the line is sung, and lit/animated on the line.
//   kind  sign   : tilted store sign board above the shelving line, readable from the overhead camera (no collision)
//         floor  : floor graphic / decal (no collision)
//         prop   : grey-block display piece with a label (BLOCKS movement: goes through the collision test)
//         anim   : prop with a scripted move (four-poster flight, wardrobe doors, car lights)
//   lead  : metres ahead of Wolfgang along the route at the line's start (so it is in frame as he arrives)
//   side  : 'L' | 'R' | 'auto' (the side with more free space)
//   fixed : [x, z] to pin a store fixture instead (entrance sign, exit glow, car)
// =====================================================================================================================
module.exports = [
  // ---- intro: the map unfolds; the store's own slogans are the hook
  { line: /^Follow the yellow$/, nth: 0, kind: 'sign', text: 'FOLLOW THE YELLOW', fixed: [-30, 28.6], w: 9, tone: 'yellow', big: true },
  { line: /^Follow the bend/, kind: 'floor', text: 'FOLLOW THE BEND', fixed: [-26.5, 25.2], w: 6, curve: true },
  { line: /^Now the kitchens have no end/, kind: 'sign', text: 'KNOSSOS KITCHENS  NOW WITH NO END', fixed: [-21, -27.0], w: 14, tone: 'teal' },
  // ---- verse 1: entrance and Ariadne Bedrooms
  { line: /^Nine forty-five/, kind: 'prop', text: '9:45', shape: 'clock', fixed: [-24, 22.6], w: 0.9, d: 0.3, h: 2.4 },
  { line: /^Nine forty-five/, kind: 'prop', text: 'FREE PENCILS', shape: 'pencils', fixed: [-22.6, 23.8], w: 0.4, d: 0.4, h: 1.25 },
  { line: /^Left at the bedroom/, kind: 'sign', text: '<- BEDROOMS', lead: 3, side: 'auto', group: 'bedrooms', w: 4.5, tone: 'teal' },
  { line: /^Right at the same one/, kind: 'sign', text: 'BEDROOMS ->', group: 'bedrooms', w: 4.5, tone: 'teal' },
  { line: /^Portrait of a family/, kind: 'prop', text: 'FAMILY (DISPLAY ONLY)', shape: 'portrait', fixed: [-35.2, 7.0], w: 0.12, d: 1.4, h: 2.0 },
  { line: /^Nobody has aged once/, kind: 'floor', text: 'EST. FOREVER', fixed: [-33, 9.3], w: 3 },
  { line: /^Yellow on the floor says keep to the route/, kind: 'floor', text: 'KEEP TO THE ROUTE', lead: 3, side: 'on', w: 4.5, tone: 'yellow' },
  { line: /^Shortcut through the curtains/, kind: 'prop', text: 'SHORTCUT', shape: 'curtain', fixed: [-22.1, 6.5], w: 0.15, d: 4.6, h: 2.6 },
  { line: /^Stepped across the paint/, kind: 'floor', text: 'WET PAINT', lead: 1.5, side: 'on', w: 3, tone: 'red' },
  { line: /^Heard a click in the ceiling/, kind: 'sign', text: 'YOU ARE BEING ASSISTED', lead: 2, side: 'R', w: 6, tone: 'red' },
  { line: /^Now my badge says/, kind: 'floor', text: 'STAFF PROMOTION ZONE', lead: 1, side: 'on', w: 5, tone: 'teal' },
  { line: /^Somewhere in the distance/, kind: 'anim', anim: 'fourposter', text: 'FOUR-POSTER (FLIGHT NOT INCLUDED)', fixed: [-33, -3.0], w: 2.2, d: 2.6, h: 2.2 },
  // ---- pre-chorus: rooms ready, tables laid, the window that never sees day, the arrow under his shoe
  { line: /^Every table laid/, kind: 'prop', text: 'TABLE FOR FOUR (NONE)', shape: 'table', fixed: [-34.2, -1.0], w: 1.6, d: 1.0, h: 0.78 },
  { line: /^Nothing in the window/, kind: 'prop', text: 'WINDOW (DECORATIVE)', shape: 'window', fixed: [-16.4, -3.0], w: 0.12, d: 2.4, h: 2.2 },
  { line: /^Keep that little arrow/, kind: 'floor', text: 'YOU ARE HERE', lead: 0, side: 'on', w: 3, tone: 'yellow' },
  { line: /^All this yellow leads me through/, kind: 'sign', text: 'THIS WAY (PROBABLY)', lead: 4, side: 'auto', w: 6, tone: 'yellow' },
  // ---- chorus 1: kitchens
  { line: /^Follow the yellow$/, nth: 1, kind: 'sign', text: 'FOLLOW THE YELLOW', lead: 5, side: 'auto', w: 7, tone: 'yellow', big: true },
  { line: /^Do not let go$/, nth: 0, kind: 'floor', text: 'DO NOT LET GO', lead: 3, side: 'on', w: 4.5, tone: 'yellow' },
  { line: /^Ariadne, get me out/, nth: 0, kind: 'sign', text: 'ARIADNE BEDROOMS  <-  EXIT  ->  (RELOCATED)', lead: 5, side: 'auto', w: 9, tone: 'teal' },
  { line: /^I have seen enough of how a life could look/, nth: 0, kind: 'sign', text: 'THIS IS HOW A LIFE COULD LOOK', lead: 6, side: 'auto', w: 9, tone: 'teal' },
  { line: /^I want the crooked chair/, nth: 0, kind: 'prop', text: 'CROOKED CHAIR  AS IS', shape: 'chair', lead: 5, side: 'auto', w: 0.6, d: 0.6, h: 0.95, tilt: 0.22 },
  { line: /^I do not need a better world/, nth: 0, kind: 'sign', text: 'A BETTER WORLD  (ASSEMBLY REQUIRED)', lead: 5, side: 'auto', w: 9, tone: 'teal' },
  { line: /^With assembly on the floor/, nth: 0, kind: 'prop', text: 'ASSEMBLY', shape: 'flatpack', lead: 4, side: 'auto', w: 1.6, d: 1.0, h: 0.12 },
  { line: /^Follow the yellow$/, nth: 2, kind: 'sign', text: 'FOLLOW THE YELLOW', lead: 4, side: 'auto', w: 6, tone: 'yellow' },
  // ---- verse 2: wardrobes; MINO and the vignettes
  { line: /^Bull-headed floor cleaner guarding the throws/, kind: 'prop', text: 'THROWS', shape: 'throws', fixed: [23.9, -24.5], w: 1.1, d: 1.0, h: 1.0 },
  { line: /^Polishes a warning/, kind: 'floor', text: 'CAUTION: FRESHLY POLISHED', lead: -3, side: 'on', w: 6, tone: 'red' },
  { line: /^Kitchen number seven/, kind: 'prop', text: 'KITCHEN No. 7  LOAF (STONE)', shape: 'counter', lead: 4, side: 'auto', w: 1.8, d: 0.7, h: 0.92 },
  { line: /^Phone on the counter/, kind: 'prop', text: 'PHONE (NO DIALLING TONE)', shape: 'phone', lead: 3, side: 'auto', w: 0.5, d: 0.5, h: 1.0 },
  { line: /^Every little drawer/, kind: 'prop', text: 'DRAWER (LOOSE STRING, KEY)', shape: 'drawer', lead: 4, side: 'auto', w: 0.9, d: 0.6, h: 0.85 },
  { line: /^Turn a price tag/, kind: 'sign', text: 'PRICE: SEE OTHER SIDE', lead: 3, side: 'auto', group: 'price', w: 6, tone: 'yellow' },
  { line: /^Find a second underneath/, kind: 'sign', text: 'PRICE: SEE UNDERNEATH', group: 'price', w: 6, tone: 'yellow' },
  { line: /^Then a third with my measurements/, kind: 'sign', text: 'TAILORED TO: WOLFGANG  H 1.9 m', group: 'price', w: 6, tone: 'red' },
  { line: /^Lifetime guarante/, kind: 'sign', text: 'LIFETIME GUARANTEE*   *SUBJECT TO REMAINING', lead: 4, side: 'auto', w: 9, tone: 'teal' },
  { line: /^Now the wardrobe doors are quietly explaining/, kind: 'anim', anim: 'wardrobes', text: 'PLEASE KEEP TO THE ROUTE', fixed: [15, -15], w: 0, d: 0, h: 0 },
  { line: /^Keep the matching breakfast set/, kind: 'prop', text: 'BREAKFAST SET', shape: 'breakfast', lead: 4, side: 'auto', w: 1.2, d: 0.8, h: 0.78 },
  { line: /^I have got amug/, kind: 'prop', text: 'MUG (WORKS)', shape: 'mug', lead: 3, side: 'auto', w: 0.35, d: 0.35, h: 0.9 },
  { line: /^Take the tape/, kind: 'prop', text: 'FREE TAPE MEASURE', shape: 'tape', lead: 3, side: 'auto', w: 0.4, d: 0.4, h: 1.25 },
  { line: /^Take the complimentary upgrade/, kind: 'sign', text: 'COMPLIMENTARY UPGRADE  (NOT YOURS)', lead: 4, side: 'auto', w: 8, tone: 'teal' },
  { line: /^One imperfect chair will do/, kind: 'prop', text: 'ONE IMPERFECT CHAIR', shape: 'chair', lead: 4, side: 'auto', w: 0.6, d: 0.6, h: 0.95, tilt: -0.18 },
  { line: /^If it has a window with an actual view/, kind: 'prop', text: 'WINDOW (VIEW SOLD SEPARATELY)', shape: 'window', lead: 4, side: 'auto', w: 0.12, d: 2.0, h: 2.0 },
  // ---- chorus 2: service corridors and core
  { line: /^Follow the yellow$/, nth: 3, kind: 'sign', text: 'FOLLOW THE YELLOW', lead: 4, side: 'auto', w: 6, tone: 'yellow' },
  { line: /^Ariadne, get me out/, nth: 1, kind: 'floor', text: 'STAFF ROUTE  (CUSTOMERS: SEE STAFF)', lead: 4, side: 'on', w: 6, tone: 'red' },
  { line: /^Follow the yellow$/, nth: 4, kind: 'sign', text: 'FOLLOW THE YELLOW', lead: 5, side: 'auto', w: 7, tone: 'yellow', big: true },
  // ---- break 2: the Minoan core
  { line: /^Heel on the gold/, kind: 'floor', text: 'GOLD', lead: 1, side: 'on', w: 3, tone: 'gold', tile: true },
  { line: /^Horn in the doorway/, kind: 'sign', text: 'MIND THE HORNS', lead: 2, side: 'auto', w: 5, tone: 'red' },
  { line: /^Somewhere a kettle/, kind: 'prop', text: "KETTLE (YESTERDAY'S STAIN)", shape: 'kettle', lead: 3, side: 'auto', w: 0.5, d: 0.5, h: 1.0 },
  { line: /^Leave me that kitchen/, kind: 'sign', text: 'KITCHEN RESERVED FOR: W.', lead: 4, side: 'auto', w: 6, tone: 'teal' },
  // ---- final chorus and escape
  { line: /^Follow the yellow$/, nth: 5, kind: 'sign', text: 'FOLLOW THE YELLOW', lead: 6, side: 'auto', w: 7, tone: 'yellow', big: true },
  { line: /^Give me back the little place/, kind: 'floor', text: 'SCRATCHES NOT INCLUDED', lead: 3, side: 'on', w: 5, tone: 'teal' },
  { line: /^Follow the yellow$/, nth: 6, kind: 'sign', text: 'EXIT  ->  FOLLOW THE YELLOW', fixed: [0, -27.6], w: 8, tone: 'yellow', big: true },
  { line: /^Out through the glow/, kind: 'floor', text: 'THANK YOU FOR NAVIGATING', fixed: [0, -30.6], w: 9, tone: 'yellow' },
  { line: /^Car keys in my hand/, kind: 'anim', anim: 'carlights', text: '', fixed: [9.45, -36], w: 0, d: 0, h: 0 },
];
