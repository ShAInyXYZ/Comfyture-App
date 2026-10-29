// Bind @names in Backstage directions to the same character and photo references used elsewhere.
import { CHARACTERS } from './characters.js';

const tag = value => String(value ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export const namesIn = text => [...new Set([...String(text ?? '').matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map(m => m[1].toLowerCase()))];

export function backstageMentionables(board, library = [], item = null, kind = 'image') {
  const out = [], used = new Set();
  const add = entry => { if (entry.name && !used.has(entry.name)) { used.add(entry.name); out.push(entry); } };
  // A deliberately selected reference takes precedence for its own name.
  if (item?.reference?.file && item.reference.name) add({ name: tag(item.reference.name), title: item.reference.name, image: item.reference.url, asset: item.reference });
  // A scene's selected cast takes precedence over the app's similarly named cast.
  for (const id of item?.characterIds ?? []) {
    const c = (board.characters ?? []).find(character => character.id === id);
    const asset = c?.image ?? c?.reference;
    if (asset?.file) add({ name: tag(c.title), title: c.title, image: asset.url, asset });
  }
  // App cast IDs are stable and take precedence over unrelated library photos.
  for (const c of CHARACTERS) add({ name: tag(c.id), title: c.name, image: c.face, character: c });
  if (item?.reference?.file) add({ name: 'identity-reference', title: item.reference.name || 'Identity reference', image: item.reference.url, asset: item.reference });
  if (kind === 'endImage' && item?.image?.file) add({ name: 'start-frame', title: 'Start frame', image: item.image.url, asset: item.image });
  for (const c of board.characters ?? []) {
    const asset = c.image ?? c.reference;
    if (asset?.file) add({ name: tag(c.title), title: c.title, image: asset.url, asset });
  }
  for (const p of library) if (p.kind === 'image' && p.file) add({ name: p.name, title: p.title || p.name, image: p.url, asset: p });
  return out;
}

export async function resolveBackstageMentions(text, candidates, loadCharacter) {
  const names = namesIn(text), missing = names.filter(n => !candidates.some(c => c.name === n));
  if (missing.length) throw new Error(`No reference found for ${missing.map(n => `@${n}`).join(', ')}. Choose a name from the @ menu or remove the tag.`);
  return Promise.all(names.map(async name => {
    const entry = candidates.find(c => c.name === name);
    const asset = entry.asset ?? await loadCharacter(entry.character);
    if (!asset?.file) throw new Error(`Could not prepare @${name}'s reference image.`);
    return { ...asset, name, title: entry.title };
  }));
}

/** Give selected project cast explicit roles even if the direction contains no @tags. */
export function labelBackstageCast(request, item, board) {
  const refs = request.refs.map(r => ({ ...r }));
  const roles = [];
  for (const id of item.characterIds ?? []) {
    const c = (board.characters ?? []).find(character => character.id === id);
    const asset = c?.image ?? c?.reference;
    const ref = refs.find(r => r.file === asset?.file);
    if (!ref) continue;
    let desired = tag(c.title) || 'character';
    if (ref.name.startsWith('character-') && !namesIn(request.prompt).includes(ref.name)) {
      let candidate = desired, suffix = 2;
      while (refs.some(r => r !== ref && r.name === candidate)) candidate = `${desired}-${suffix++}`;
      ref.name = candidate;
    }
    roles.push(`@${ref.name} is ${c.title}.`);
  }
  const prompt = roles.length ? `${request.prompt}\n\nCharacter references: ${roles.join(' ')}` : request.prompt;
  if (prompt.length > 6000) throw new Error('Shorten the scene and visual direction so the full image prompt stays under 6,000 characters.');
  return { ...request, refs, prompt };
}

// A single file is sent once. If a named reference is already attached under another
// name, point the prompt at that reference instead of silently dropping the tag.
export function bindBackstageMentions(request, mentions) {
  const refs = request.refs.map(r => ({ ...r }));
  let prompt = request.prompt;
  for (const mention of mentions) {
    let existing = refs.find(r => r.file === mention.file);
    if (!existing) {
      if (refs.some(r => r.name === mention.name)) throw new Error(`@${mention.name} conflicts with another reference. Rename or remove one reference.`);
      existing = { file: mention.file, name: mention.name };
      refs.push(existing);
    } else if (existing.name !== mention.name && existing.name === 'identity-reference' && !namesIn(prompt).includes(existing.name)) {
      existing.name = mention.name;
    } else if (existing.name !== mention.name) {
      const wanted = mention.name;
      prompt = prompt.replace(/@([a-z0-9][a-z0-9-]*)/gi, (whole, name) => name.toLowerCase() === wanted ? `@${existing.name}` : whole);
    }
  }
  if (refs.length > 10) throw new Error('This image can use up to 10 references. Remove a character or reference before generating.');
  return { ...request, template: refs.length ? 'edit' : 'generate', refs, prompt };
}
