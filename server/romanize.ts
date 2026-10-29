import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import { spawn } from "node:child_process";

let ready: Promise<any> | undefined;
export async function romanizeJapanese(lines: string[]): Promise<string[]> {
  ready ??= (async () => {
    const engine = new Kuroshiro();
    await engine.init(new KuromojiAnalyzer());
    return engine;
  })();
  const engine = await ready;
  return Promise.all(lines.map((line) => engine.convert(line, { to: "romaji", mode: "spaced", romajiSystem: "hepburn" })));
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
