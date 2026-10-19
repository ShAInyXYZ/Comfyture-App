// @names in a text field: the one being typed at the caret, and a name put in its place.

/** The @word being typed at the caret, if any: what follows the @, and where the @ is. */
export function mentionAt(input) {
  const before = input.value.slice(0, input.selectionStart);
  const m = before.match(/(?:^|\s)@([a-z0-9-]*)$/i);
  return m ? { query: m[1].toLowerCase(), from: before.length - m[1].length - 1 } : null;
}

/** @name in place of the @word at the caret (or at the caret when none is being typed), a space after it. */
export function putMention(input, name) {
  const at = mentionAt(input);
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, at ? at.from : caret);
  const after = at ? input.value.slice(caret).replace(/^[a-z0-9-]*/i, "") : input.value.slice(caret);
  const text = `${before}${before && !/\s$/.test(before) ? " " : ""}@${name}${/^\s/.test(after) ? "" : " "}`;
  input.value = text + after;
  input.setSelectionRange(text.length, text.length);
  input.focus();
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
