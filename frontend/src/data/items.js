// Item icons as inline SVG, used by the DOM inventory grid. The on-ground sprites use
// matching canvas textures generated in game/tiles.js (s_wool / s_cowhide).

const ICONS = {
  wool: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <g fill="#f2efe6" stroke="#cfcabb" stroke-width="1">
      <circle cx="11" cy="19" r="6"/><circle cx="21" cy="19" r="6"/>
      <circle cx="16" cy="13" r="6"/><circle cx="16" cy="21" r="6"/>
    </g></svg>`,
  cowhide: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="7" width="22" height="18" rx="5" fill="#d8b489" stroke="#a07d54" stroke-width="1"/>
    <circle cx="12" cy="14" r="3.5" fill="#3a342c"/>
    <circle cx="21" cy="19" r="4" fill="#3a342c"/>
    <circle cx="20" cy="11" r="2" fill="#3a342c"/></svg>`,
  hatchet: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <rect x="14.5" y="9" width="3" height="18" rx="1.5" fill="#6b4a2f"/>
    <path d="M15 7 L27 11 L27 17 L15 14 Z" fill="#c2c8cf" stroke="#7c848c" stroke-width="1"/></svg>`,
  log: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="12" width="22" height="8" rx="4" fill="#7a5a36" stroke="#5a4326" stroke-width="1"/>
    <ellipse cx="24" cy="16" rx="2.5" ry="4" fill="#caa56e"/>
    <ellipse cx="24" cy="16" rx="1" ry="2" fill="#8a6b3f"/></svg>`,
  tinderbox: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="14" width="18" height="11" rx="2" fill="#6b4a2f" stroke="#4a3620" stroke-width="1"/>
    <rect x="7" y="13" width="18" height="3" fill="#8a6b3f"/>
    <path d="M16 6 L20 14 L12 14 Z" fill="#e07b2f"/>
    <path d="M16 9 L18.5 14 L13.5 14 Z" fill="#f2c14e"/></svg>`,
  "raw beef": `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="15" cy="18" rx="11" ry="8" fill="#c0504d" stroke="#8a3a37" stroke-width="1"/>
    <ellipse cx="14" cy="17" rx="6" ry="4" fill="#d97a77"/>
    <circle cx="25" cy="12" r="3" fill="#f2efe6" stroke="#cfcabb" stroke-width="1"/></svg>`,
  beef: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="15" cy="18" rx="11" ry="8" fill="#8a5a32" stroke="#5e3d22" stroke-width="1"/>
    <ellipse cx="14" cy="17" rx="6" ry="4" fill="#a9763f"/>
    <circle cx="25" cy="12" r="3" fill="#f2efe6" stroke="#cfcabb" stroke-width="1"/></svg>`,
  coins: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="13" cy="22" rx="9" ry="4" fill="#d9b65a" stroke="#a8862f" stroke-width="1"/>
    <ellipse cx="13" cy="18" rx="9" ry="4" fill="#e9c96a" stroke="#a8862f" stroke-width="1"/>
    <ellipse cx="13" cy="14" rx="9" ry="4" fill="#f2d98a" stroke="#a8862f" stroke-width="1"/></svg>`,
  pickaxe: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <rect x="14.5" y="7" width="2.5" height="20" rx="1" fill="#6b4a2f"/>
    <path d="M5 11 Q16 5 27 11 L25.5 13.5 Q16 8.5 6.5 13.5 Z" fill="#9aa3ab" stroke="#6b727a" stroke-width="1"/></svg>`,
  hammer: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <rect x="14.5" y="12" width="2.5" height="15" rx="1" fill="#6b4a2f"/>
    <rect x="8" y="6" width="16" height="8" rx="1.5" fill="#9aa3ab" stroke="#6b727a" stroke-width="1"/></svg>`,
  ore: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 21 L11 11 L21 9 L26 17 L21 26 L11 25 Z" fill="#8a8f96" stroke="#5e636a" stroke-width="1"/>
    <circle cx="14" cy="16" r="2.2" fill="#b9772f"/>
    <circle cx="20" cy="19" r="1.6" fill="#cf9a4a"/></svg>`,
  knife: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <rect x="13.5" y="15" width="5" height="12" rx="2" fill="#6b4a2f" stroke="#4a3620" stroke-width="1"/>
    <path d="M16 5 L22 15 L10 15 Z" fill="#c2c8cf" stroke="#7c848c" stroke-width="1"/>
    <path d="M16 7 L20 15 L16 14 Z" fill="#e1e6eb" opacity="0.7"/></svg>`,
};

const GENERIC = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="19" r="9" fill="#c9a24a" stroke="#8a6b2f" stroke-width="1"/>
  <rect x="11" y="8" width="10" height="4" fill="#8a6b2f"/></svg>`;

export function itemIcon(name) {
  return ICONS[name] || GENERIC;
}
