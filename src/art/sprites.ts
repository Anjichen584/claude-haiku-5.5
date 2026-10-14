import Phaser from 'phaser';
import type { EnemyDef, NpcDef } from '../data/schema';

const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><g stroke="#162a2c" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
const shadow = '<ellipse cx="64" cy="113" rx="34" ry="8" fill="#081b20" opacity=".28" stroke="none"/>';
export type Role = 'hero' | 'guard' | 'mage' | 'merchant' | 'hunter' | 'villager';
export function personSvg(role: Role): string {
  const colors = { hero: '#4f9c99', guard: '#75899a', mage: '#8d7bb9', merchant: '#bf8150', hunter: '#758a51', villager: '#b29b71' };
  const c = colors[role];
  return wrap(shadow + `<path d="M43 69L32 106Q64 119 91 106L85 65" fill="${c}"/><path d="M47 90L46 111H58L62 93M68 93L70 111H82L79 88" fill="#293e43"/><path d="M44 112h16m9 0h16" stroke="#d2b886" stroke-width="5"/><path d="M42 56L29 82L38 88L53 69M83 56L96 80L87 87L76 69" fill="${c}"/><circle cx="34" cy="85" r="6" fill="#e1ba8a"/><circle cx="93" cy="84" r="6" fill="#e1ba8a"/><path d="M43 59Q64 47 85 59L82 90H46Z" fill="${c}"/><path d="M63 57L60 93H70L68 57" fill="#ead6a4" stroke="none"/><path d="M44 86H83" stroke="#4a3430" stroke-width="7"/><rect x="60" y="82" width="10" height="9" rx="2" fill="#e9bf6b"/><ellipse cx="64" cy="40" rx="19" ry="23" fill="#e3bd8f"/><path d="M46 37Q41 13 65 13Q88 17 83 39L74 27L52 32Z" fill="#433d35"/><path d="M56 41h1m14 0h1" stroke="#193238" stroke-width="4"/><path d="M60 51q5 3 9-1" fill="none" stroke="#ac7761" stroke-width="2"/>` +
    (role === 'hero' ? '<path d="M42 54L61 64L84 51L77 70L52 70Z" fill="#e1b56d"/><path d="M91 88L105 43L109 39L111 46L99 91" fill="#c4ded9"/><path d="M88 85l17 5" stroke="#e3bb71" stroke-width="5"/>' : '') +
    (role === 'merchant' ? '<path d="M40 29Q40 6 66 9Q86 10 88 29Z" fill="#c89054"/><path d="M34 30H94" stroke="#e8c27d" stroke-width="7"/><path d="M51 48Q64 66 79 47L76 65L61 71L50 59" fill="#e8dec4"/><path d="M88 77q29-8 25 21q-3 15-24 9Z" fill="#9c6b42"/><circle cx="101" cy="92" r="6" fill="#efcd77"/>' : '') +
    (role === 'guard' ? '<path d="M44 35Q41 12 64 10Q86 12 85 35L72 29H56Z" fill="#9cafb4"/><path d="M64 12V28" stroke="#d9e2d9"/><path d="M25 67L41 73L38 100L25 106L14 94L13 74Z" fill="#557c85"/><path d="M26 75v22m-7-14h15" stroke="#dfc289"/><path d="M96 88V27l-5-9 7-13 7 13-5 9" fill="#b9d5ce"/>' : '') +
    (role === 'mage' ? '<path d="M34 31L57 2L72 4L84 31Z" fill="#7971a5"/><path d="M33 32H91" stroke="#cdbd8d" stroke-width="5"/><path d="M99 105V38" stroke="#8d684e" stroke-width="6"/><circle cx="99" cy="31" r="11" fill="#87d1d1"/><path d="M99 21v20m-10-10h20" stroke="#d3ffff" stroke-width="2"/>' : '') +
    (role === 'hunter' ? '<path d="M44 34Q39 10 65 10Q88 12 85 34L68 22Z" fill="#59754b"/><path d="M98 47q28 30 0 58M98 47v58" fill="none" stroke="#c8a572"/>' : '') +
    (role === 'villager' ? '<path d="M43 30Q42 10 65 12Q83 14 85 29Z" fill="#a69572"/><path d="M48 68H79V85H48Z" fill="#d3bc90"/>' : ''));
}
export function npcRole(n: Pick<NpcDef, 'name' | 'id'>): Role {
  const s = n.name + n.id;
  if (/商|贩|店|merchant|trader|shop/.test(s)) return 'merchant';
  if (/卫|兵|队长|骑|守|guard|warden/.test(s)) return 'guard';
  if (/法|学|祭|僧|研究|图书|mage|scholar/.test(s)) return 'mage';
  if (/猎|斥候|游侠|hunter|ranger/.test(s)) return 'hunter';
  return 'villager';
}
export function enemySvg(e: EnemyDef): string {
  const s = e.id;
  const accent = ({ fire: '#f7a463', ice: '#a8e8ec', poison: '#b3d27a', lightning: '#ddc77c', void: '#b59cde', dark: '#b59cde', holy: '#e5dca7' } as Record<string,string>)[e.element ?? ''] ?? '#9bc298';
  const base = e.element === 'ice' ? '#658e9b' : e.element === 'fire' ? '#876354' : e.element === 'void' || e.element === 'dark' ? '#655c83' : '#69796b';
  let b = '';
  if (/crow|owl|moth/.test(s)) {
    b=`<path d="M50 57L14 32L6 51L29 86L51 89M78 57L114 31L122 52L100 87L76 89" fill="${base}"/><path d="M49 54Q64 39 80 55L88 90L64 107L43 89Z" fill="${base}"/><path d="M49 55L43 28L58 39L72 37L85 24L82 62Z" fill="${base}"/><circle cx="56" cy="54" r="6" fill="${accent}"/><circle cx="74" cy="54" r="6" fill="${accent}"/><path d="M62 62l5 10 5-10M54 104l-5 11m24-11 5 11" fill="#d4b278"/><path d="M20 49L40 76M107 48L89 76" stroke="${accent}" fill="none"/>`;
  } else if (/stag/.test(s)) {
    b=`<path d="M32 67Q56 53 81 70L89 93L41 95Z" fill="${base}"/><path d="M41 87L34 113H44L54 90M76 88L82 113H92L88 86" fill="${base}"/><path d="M76 76L72 47L79 32L96 33L107 56L97 77Z" fill="${base}"/><path d="M81 36L65 22L62 6M67 25L49 19L46 9M95 35L111 22L114 5M109 25L123 17" fill="none" stroke="${accent}" stroke-width="5"/><path d="M82 48h3m11 0h3" stroke="${accent}" stroke-width="4"/>`;
  } else if (/toad|mother|matriarch/.test(s)) {
    b=`<path d="M33 73L16 91L13 110L45 108M92 73L112 92L115 110L81 109" fill="${base}"/><ellipse cx="65" cy="81" rx="36" ry="29" fill="${base}"/><path d="M33 64Q27 35 44 32Q57 28 63 44Q70 26 86 31Q108 39 96 67Z" fill="${base}"/><circle cx="46" cy="48" r="10" fill="${accent}"/><circle cx="83" cy="48" r="10" fill="${accent}"/><path d="M43 48h5m32 0h5M43 70Q65 81 88 69" fill="none" stroke="#203a35" stroke-width="4"/><path d="M48 92Q65 103 83 89" fill="none" stroke="${accent}" stroke-width="5"/>`;
  } else if (/fragment/.test(s)) {
    b=`<path d="M64 10L88 51L76 99L55 114L37 67Z" fill="${base}"/><path d="M64 10L62 65L88 51M62 65L55 114M37 67L62 65L76 99" fill="none" stroke="${accent}" stroke-width="4"/><path d="M22 35L29 48L20 60L14 46M107 78L116 91L108 104L102 91" fill="${accent}"/>`;
  } else if (/wolf|hound|rat|hare|hyena|boar|bear|cat|alpha|stalker/.test(s)) {
    b = `<path d="M29 70L16 51L12 76L31 91" fill="${base}"/><path d="M33 67Q59 48 85 67L94 93L40 98L28 84Z" fill="${base}"/><path d="M38 85L32 110H45L52 90M75 88L82 110H96L89 83" fill="${base}"/><path d="M71 61L72 30L87 44L104 32L103 59L116 76L99 90L79 79Z" fill="${base}"/><path d="M79 53L85 56M97 55l6-4" stroke="${accent}" stroke-width="5"/><path d="M96 72l18 3-12 8Z" fill="#23393c"/><path d="M77 62L63 66L75 74L61 77L78 84" fill="${accent}" stroke="none"/>`;
  } else if (/golem|guardian|warden|colossus|titan|sentinel|treant/.test(s)) {
    b = `<path d="M31 48L19 61L17 90L32 97L42 77L43 53M89 48L109 60L113 91L98 100L85 76" fill="${base}"/><path d="M38 46L53 34H80L94 49L88 91L66 102L40 86Z" fill="${base}"/><path d="M44 90L38 113H55L64 96M74 94L78 114H96L89 86" fill="${base}"/><path d="M44 35L50 13L78 10L91 27L84 51L59 55Z" fill="#8b9a88"/><path d="M53 33h9m13-2h7" stroke="${accent}" stroke-width="5"/><path d="M63 57L55 72L67 86L79 69Z" fill="${accent}"/><path d="M30 58L21 41L39 44M84 18L87 8L99 21" fill="#759263"/>`;
  } else if (/spider|scorpion|beetle|crab|mite|crawler|leech/.test(s)) {
    b = `<path d="M47 66L23 43L9 54M40 77L15 68L7 83M44 89L20 93L12 111M82 67L104 43L119 55M86 79L112 68L122 83M81 91L107 94L114 112" fill="none" stroke="${base}" stroke-width="8"/><ellipse cx="65" cy="74" rx="28" ry="30" fill="${base}"/><path d="M47 56L55 42H78L87 56L79 72H54Z" fill="#526867"/><path d="M55 56h3m15 0h3" stroke="${accent}" stroke-width="5"/><path d="M61 76L54 91L67 100L78 89L69 77" fill="${accent}"/>`;
  } else if (/wisp|ghost|spirit|shadow|specter|whisper|shade|wraith|sprite|herald/.test(s)) {
    b = `<path d="M30 95Q42 81 36 56Q35 20 65 15Q100 17 95 55Q86 78 108 94L86 91L81 110L62 101L44 112L47 94Z" fill="${base}"/><path d="M46 60Q46 27 67 27Q88 30 83 60L74 70L65 60L53 71Z" fill="${accent}"/><path d="M51 46l10 5m12 0 8-6" stroke="#20343e" stroke-width="5"/><path d="M66 77l-4 13" stroke="${accent}"/>`;
  } else if (/dragon|wyrm|drake|serpent|lizard/.test(s)) {
    b = `<path d="M46 63L8 24L14 80L40 91M83 61L117 22L116 82L88 92" fill="${base}"/><path d="M52 63Q34 86 52 106L89 110L111 98L85 99Q106 72 83 55" fill="${base}"/><path d="M49 61L43 30L53 9L64 26L82 11L88 39L97 54L83 74L59 77Z" fill="${base}"/><path d="M53 42l9 6m12-1 10-7" stroke="${accent}" stroke-width="5"/><path d="M61 67L63 96L80 100L81 69" fill="${accent}"/>`;
  } else if (/slime|ooze|fung|mushroom/.test(s)) {
    b = `<path d="M22 97Q21 71 39 55Q30 27 63 16Q99 27 91 57Q110 72 107 99Q65 117 22 97Z" fill="${base}"/><path d="M29 55Q35 12 65 16Q97 19 101 57Z" fill="${accent}"/><circle cx="50" cy="38" r="7" fill="#e9e2b6"/><circle cx="80" cy="35" r="6" fill="#e9e2b6"/><path d="M51 79h2m21 0h2" stroke="#20343e" stroke-width="6"/>`;
  } else {
    b = personSvg(/mage|cultist|seer|shaman|witch|queen/.test(s) ? 'mage' : 'guard').replace(/^.*?<g[^>]*>/,'').replace(/<\/g><\/svg>$/,'').replace(/#e3bd8f/g,base).replace(/#e3bb71/g,accent);
  }
  const crown = e.boss ? `<path d="M40 20L34 3L53 12L65 0L76 12L96 3L87 23Z" fill="${accent}"/><circle cx="65" cy="13" r="3" fill="#fff2c9"/>` : e.elite ? `<path d="M62 5L70 14L62 23L54 14Z" fill="${accent}"/>` : '';
  return wrap(shadow + b + crown);
}
export function preloadArt(scene: Phaser.Scene, enemies: readonly EnemyDef[]): void {
  const add = (key: string, svg: string) => { if (!scene.textures.exists(key)) scene.load.svg(key, `data:image/svg+xml;base64,${btoa(svg)}`); };
  for (const r of ['hero','merchant','guard','mage','hunter','villager'] as Role[]) add(`actor-${r}`, personSvg(r));
  for (const e of enemies) add(`enemy-${e.id}`, enemySvg(e));
  add('tree', wrap('<path d="M58 73H72L77 117H53Z" fill="#65503a"/><path d="M18 80L37 52H26L47 29H39L64 0L91 32H83L105 56H94L115 83L84 95L63 89L40 96Z" fill="#325c53"/><path d="M38 65L63 24L88 65L66 60L52 75Z" fill="#477866" stroke="none"/><path d="M46 87L66 63L86 86" fill="none" stroke="#598977" stroke-width="3"/>'));
  add('bush', wrap('<ellipse cx="65" cy="107" rx="48" ry="9" fill="#163c30" opacity=".3" stroke="none"/><path d="M16 101Q7 77 30 71Q19 42 47 46Q58 21 77 43Q105 34 104 67Q126 81 109 100Z" fill="#527452"/><path d="M34 84L47 68L58 85M75 78L85 60L97 82" fill="none" stroke="#7f965e" stroke-width="4"/><circle cx="43" cy="91" r="4" fill="#cfb77b"/><circle cx="90" cy="88" r="3" fill="#cfb77b"/>'));
  add('rock', wrap(shadow + '<path d="M22 97L31 66L57 51L91 60L108 94L91 110H41Z" fill="#62716c"/><path d="M31 66L63 75L57 51M63 75L91 60M63 75L57 109" fill="none" stroke="#82918a"/><path d="M29 90l22-8" stroke="#849660" stroke-width="8"/>'));
  add('house', wrap('<ellipse cx="64" cy="115" rx="57" ry="8" fill="#102d2b" opacity=".3" stroke="none"/><path d="M24 57H105V113H24Z" fill="#b3a37d"/><path d="M13 64L64 18L116 64L106 73L64 39L21 73Z" fill="#685149"/><path d="M29 53L64 24L100 54M33 63L65 36L94 62" fill="none" stroke="#96785b"/><path d="M54 78Q65 67 77 78V113H54Z" fill="#443d34"/><path d="M32 82H44V95H32ZM87 82H99V95H87Z" fill="#e8c97b"/><path d="M31 110H50M83 110H105" stroke="#7c8362" stroke-width="6"/><path d="M89 32V12H101V44" fill="#8b8470"/>'));
  add('stall', wrap('<path d="M20 63H108V111H20Z" fill="#866446"/><path d="M21 66V24M107 66V24" stroke="#c1a272" stroke-width="5"/><path d="M11 57L29 24H99L118 57Z" fill="#c0875f"/><path d="M38 25L28 57H46L52 25M76 25L82 57H101L90 25" fill="#e9d1a0" stroke="none"/><path d="M12 57Q21 70 30 57Q40 70 48 57Q57 70 66 57Q75 70 84 57Q93 70 102 57Q111 70 118 57" fill="#e9d1a0"/><path d="M16 83H113V98H16Z" fill="#c6a16a"/><circle cx="37" cy="78" r="7" fill="#b5bd65"/><path d="M62 69h12v12H62Z" fill="#80b8ac"/><path d="M88 70l8-3 5 13H87Z" fill="#d8ae62"/>'));
  add('portal', wrap('<ellipse cx="64" cy="115" rx="51" ry="9" fill="#101a28" opacity=".5"/><path d="M27 109V53Q26 10 64 8Q102 11 102 53V109L84 115H43Z" fill="#536d69"/><path d="M42 108V53Q42 27 64 26Q87 28 87 53V109Z" fill="#333a59"/><path d="M49 103V55Q49 35 65 34Q80 36 80 55V102Z" fill="#80b7b0"/><path d="M58 97L70 75L60 61L71 44" fill="none" stroke="#d1e8bd" stroke-width="4"/><path d="M27 63h14M87 63h16M30 87h12M87 87h13" stroke="#96b4a1" stroke-width="3"/>'));
}
