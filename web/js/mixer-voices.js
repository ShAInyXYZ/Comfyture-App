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
