import test from 'node:test';
import assert from 'node:assert/strict';
import { romanizeJapanese, romanizeLyrics } from '../server/romanize.ts';

test('negative and past conjugations keep small tsu with the following mora', async () => {
  assert.deepEqual(await romanizeJapanese(['言えなかった言葉', '走った 歩いている 嬉しかった', '食べませんでした', '行っちゃった']), [
    'ienakatta kotoba', 'hashitta aruiteiru ureshikatta', 'tabemasendeshita', 'itchatta',
  ]);
});

test('lyric inflections stay together while independent words and particles keep spaces', async () => {
  assert.deepEqual(await romanizeLyrics(['握りしめて 空を見上げた', '君の影が 少し伸びていた', '窓辺でギターを弾いていた']), [
    'nigirishimete sora o miageta', 'kimi no kage ga sukoshi nobiteita', 'madobe de gitā o hiiteita',
  ]);
});

test('mixed-script lyrics preserve Latin punctuation, numbers, lines and readable boundaries', async () => {
  assert.deepEqual(await romanizeLyrics(["I'm here, 君とJ-POPを歌った！", '  Hello   123  ', '', 'ずっと、ありがとう。']), [
    "I'm here, kimi to J-POP o utatta！", 'Hello 123', '', 'zutto、arigatō。',
  ]);
});

test('long vowels, volition and ordinary word boundaries retain the existing Hepburn readings', async () => {
  assert.deepEqual(await romanizeLyrics(['夜空に輝く星', 'ありがとう', '行こう', '空っぽの部屋']), [
    'yozora ni kagayaku hoshi', 'arigatō', 'ikō', 'karappo no heya',
  ]);
});
