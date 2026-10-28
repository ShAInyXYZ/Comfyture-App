// Authored character direction, not a cloned voice or an inference from someone's photo.
export const CHARACTER_VOICES = {
  earl: "Low baritone with a dry, weathered texture and a gentle Texas drawl. Unhurried, understated delivery; short skeptical pauses and clipped deadpan punchlines. Warm beneath the grumbling. Never a booming announcer or exaggerated cowboy caricature.",
  josie: "Bright, warm mid-high voice with lightly breathy texture and conversational American English. Quick, playful phrasing and an audible smile; sincerity turns into mischievous restraint. Natural adult speech, never squeaky or a commercial presenter.",
  theo: "Soft mid-low voice, relaxed conversational English, easy measured rhythm and quietly amused understatement. A laid-back producer who listens before answering. Never flat or sleepy.",
  dre: "Warm resonant mid-low voice, relaxed conversational English and generous expressive rhythm. Big-hearted older-brother confidence, playful emphasis and an easy chuckle. Never shouted or an announcer.",
  margot: "Full, warm alto with mature texture, clear diction and a lightly theatrical lilt. A former stage actress with elegant timing, a knowing smile and controlled dramatic pauses. Intimate conversation, not stage projection.",
  ivy: "Gentle mid-register voice with a slightly airy texture, thoughtful conversational English and curious, uneven little pauses. Soft-spoken plant-shop wit, precise dry punchlines and delighted small laughs. Never monotone.",
  praline: "For scripted speech only: nimble warm mid-register character voice, confident playful phrasing and a conspiratorial smile; a friendly ringleader. Otherwise natural cat vocalizations.",
  sesame: "For scripted speech only: soft low-mid character voice, economical words, skeptical pauses and dry reactive wit. Otherwise natural cat vocalizations.",
  mochi: "For scripted speech only: round mellow mid-low character voice, earnest slow beginnings and unexpectedly sharp comic endings. Otherwise natural cat vocalizations.",
  meringue: "For scripted speech only: light clear character voice, musical cadence, poised confidence and playful dramatic timing. Otherwise natural cat vocalizations.",
};

export function castVoiceDirection(cast) {
  const lines = cast.map(({ role, who }) => {
    const voice = who?.voice?.trim() || CHARACTER_VOICES[who?.crew];
    return `${role}: ${voice || "Use a natural conversational voice appropriate to the scripted role. A photo provides visual identity only; it does not provide or clone this person's voice."}`;
  });
  return `CHARACTER VOICE DIRECTION (apply only to scripted speech, never add dialogue):\n${lines.join("\n")}\nKeep each voice distinct and consistent across takes. Follow the script's speaker assignments. Preserve breaths and small hesitations; no presenter cadence. This is text direction, not a supplied voice recording.`;
}

export function nativeRecipeRequest(recipe, shot, file, prompt, seed) {
  const duration = shot.to - shot.from;
  if (recipe.template === "api_ltx2_5_i2v") return {
    confirm: true,
    inputs: { image: { file }, prompt, seed },
    overrides: { "5": { model: "LTX-2.5 (Pro)", "model.duration": String(duration),
      "model.resolution": recipe.settings?.resolution ?? "1080x1920", "model.fps": "24", "model.generate_audio": true } },
  };
  return { confirm: true, inputs: { ...recipe.settings, duration, first_frame: { file }, prompt, seed } };
}

// Original synthetic character recordings. A picture never supplies someone's real voice.
export const CHARACTER_VOICE_SAMPLES = {
  ivy: { url: 'brand/mixer/voices/ivy-v1.mp3', name: 'Ivy', provenance: 'Original Seed Audio voice design' },
};

export function voiceReferenceFor(recipe, cast) {
  if (!recipe.voiceConversion) return null;
  const who = cast.find(c => c.role === recipe.voiceConversion.role)?.who;
  if (!who) throw new Error('The voice role is missing from this cast.');
  if (who.voiceSample?.file) return { ...who.voiceSample, name: 'Your supplied voice' };
  // Uploaded photos play the fictional role, with its explicitly labelled stock voice.
  return CHARACTER_VOICE_SAMPLES[who.crew ?? (who.star ? recipe.voiceConversion.referenceCrew : '')] ?? null;
}

/** Resumable single-speaker post-production. Keep the performance and room sound separate. */
export async function applyCharacterVoice(recipe, cast, shot, { call, send, upload, persist, progress, sleep }) {
  const reference = voiceReferenceFor(recipe, cast);
  if (!reference) return; // Other crew retain their directed native voice until a sample is authored.
  const pass = shot.voicePass ??= { name: reference.name };
  if (pass.converted && pass.ambience && pass.mixVersion === 1) return;
  const stage = async (key, template, request, label) => {
    const state = pass[key] ??= {};
    if (state.pending && !state.job?.id) throw new Error('The previous voice submission needs checking on Comfy Cloud; no duplicate was sent.');
    progress(label);
    if (!state.job?.id) {
      state.pending = true; persist();
      try {
        state.job = await send(`api/utensils/templates/${template}/run`, 'POST', request);
        state.pending = false;
      } catch (e) {
        if (e.status >= 400 && e.status < 500) state.pending = false;
        persist(); throw e;
      }
      persist();
    }
    while (state.job.status === 'running') {
      await sleep();
      state.job = await call(`api/utensils/templates/job/${state.job.id}`); persist();
    }
    if (state.job.status !== 'done') throw new Error(state.job.error ?? 'Voice processing did not finish. Check the existing job before retrying.');
    return state.job.outputs ?? [];
  };
  pass.source ??= await upload(shot.output.url, 'video/mp4', 'Trend original performance'); persist();
  pass.reference ??= reference.file ? reference : await upload(reference.url, 'audio/mpeg', `${reference.name} voice reference`); persist();
  const stems = await stage('separation', 'audio_melbandroformer_audio_separation', { confirm: true, inputs: { audio: { file: pass.source.file } } }, 'Separating dialogue and room sound');
  const vocals = stems.find(o => o.kind === 'audio' && (o.node === '4' || /vocals/i.test(o.filename ?? o.file)));
  const ambience = stems.find(o => o.kind === 'audio' && (o.node === '5' || /instruments/i.test(o.filename ?? o.file)));
  if (!vocals || !ambience) throw new Error('The voice and ambience stems could not be identified.');
  pass.ambience = ambience; persist();
  const outputs = await stage('conversion', 'audio-chatterbox_vc', {
    confirm: true, inputs: { audio: { file: pass.reference.file }, audio3: { file: vocals.file }, seed: 281026106 },
    overrides: { '5': { start_time: '0:00', end_time: `0:${Math.ceil(shot.to - shot.from).toString().padStart(2, '0')}` } },
  }, `Giving the performance ${reference.name}'s voice`);
  pass.converted = outputs.find(o => o.kind === 'audio');
  if (!pass.converted) throw new Error('Voice conversion finished without audio.');
  pass.rawConverted = pass.converted;
  progress('Balancing dialogue above footsteps and room sound');
  if (!pass.masterJob || ['failed', 'canceled'].includes(pass.masterJob.status)) {
    pass.masterJob = await send('api/utensils/fx/master', 'POST', { file: pass.rawConverted.file, preset: 'custom', lufs: -18, peak: -2, range: 11, format: 'wav', title: `${reference.name} dialogue` });
    persist();
  }
  while (['queued', 'running'].includes(pass.masterJob.status)) {
    await sleep();
    pass.masterJob = await call(`api/utensils/fx/jobs/${pass.masterJob.id}`); persist();
  }
  if (pass.masterJob.status !== 'done') throw new Error(pass.masterJob.error ?? 'Dialogue loudness correction did not finish.');
  pass.converted = pass.masterJob.results?.find(o => o.kind === 'audio');
  if (!pass.converted) throw new Error('Dialogue loudness correction returned no audio.');
  pass.ambienceVolume = 0.25; // -12 dB: foley supports the dialogue instead of competing with it.
  pass.mixVersion = 1;
  pass.finishedAt = new Date().toISOString(); persist();
}
