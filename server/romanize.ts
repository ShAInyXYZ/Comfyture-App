import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import { spawn } from "node:child_process";

let ready: Promise<any> | undefined;

type Token = {
  surface_form: string; reading?: string; pronunciation?: string;
  pos?: string; pos_detail_1?: string;
};
const inflected = (token: Token) => ["動詞", "形容詞", "助動詞"].includes(token.pos ?? "");
const connective = (token: Token) => token.pos === "助詞" && token.pos_detail_1 === "接続助詞" && /^[てで]$/u.test(token.surface_form);
const readingOf = (token: Token) => token.pronunciation || token.reading || token.surface_form;

/** Convert a complete inflection together: なかっ + た is nakatta, never nakatsu ta.
 * Particles and independent words keep their readable spaces. */
function romanizeTokens(tokens: Token[]): string {
  const groups: { reading: string; last: Token }[] = [];
  for (const token of tokens) {
    const previous = groups.at(-1);
    const last = previous?.last;
    const join = last && (
      (token.pos === "助動詞" && inflected(last)) ||
      (connective(token) && inflected(last)) ||
      (token.pos === "動詞" && token.pos_detail_1 === "非自立" && (inflected(last) || connective(last))) ||
      // The analyzer can split contracted kana into another token as well.
      (/[っッ]$/u.test(previous.reading) && /^[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(readingOf(token)))
    );
    // Japanese volitional う lengthens the preceding verb's final vowel.
    const reading = join && token.pos === "助動詞" && token.surface_form === "う" && last.pos === "動詞" ? "ー" : readingOf(token);
    if (join) { previous.reading += reading; previous.last = token; }
    else groups.push({ reading, last: token });
  }
  return groups.map(({ reading }) => Kuroshiro.Util.kanaToRomaji(reading, "hepburn")).join(" ");
}

export async function romanizeJapanese(lines: string[]): Promise<string[]> {
  ready ??= (async () => {
    const analyzer = new KuromojiAnalyzer();
    await analyzer.init();
    return analyzer;
  })();
  const analyzer = await ready;
  return Promise.all(lines.map(async (line) => {
    // Leave Latin names, punctuation and numbers intact; do not tokenize "I'm" or
    // "J-POP" into separate words. Explicit whitespace also bounds conjugations.
    const chunks = line.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々ー]+|[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々ー]+/gu) ?? [];
    const converted = await Promise.all(chunks.map(async (chunk) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(chunk) ? romanizeTokens(await analyzer.parse(chunk)) : chunk));
    return converted.reduce((out, chunk) => out + (/\p{Letter}|\p{Number}/u.test(out.at(-1) ?? "") && /^[\p{Letter}\p{Number}]/u.test(chunk) ? " " : "") + chunk, "").replace(/\s+/gu, " ").trim();
  }));
}

export async function romanizeLyrics(lines: string[]): Promise<string[]> {
  if (lines.some((line) => /[\u3040-\u30ff]/u.test(line))) return romanizeJapanese(lines);
  return new Promise((resolve, reject) => {
    const child = spawn("uconv", ["-x", "Any-Latin; Latin-ASCII"]);
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trimEnd().split("\n")) : reject(new Error("Romanization is unavailable.")));
    child.stdin.end(lines.join("\n"));
  });
}
