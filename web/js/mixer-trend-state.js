export const uploadRole = (trend, selected) => selected ?? trend?.cast?.[0]?.role ?? null;

// Resume only the same trend with the same people; a changed cast makes a new mix.
export function canResumeTrend(mix, id, roles, revision = 1) {
  return !!mix && mix.body?.kind === "trend" && mix.body.trend?.id === id && !mix.body.film
    && (mix.body.trend.revision ?? 1) === revision
    && Object.keys(roles).every((role) => {
      const before = mix.body.trend.cast?.[role];
      const after = roles[role];
      return before && (before.voiceSample?.file ?? null) === (after.voiceSample?.file ?? null)
        && (before.voice ?? "") === (after.voice ?? "") && (after.crew ? before.crew === after.crew : before.star?.file === after.star?.file);
    });
}

export function validateRecipe(recipe, files) {
  if (!recipe?.shots?.length) throw new Error("This trend has no shots to generate.");
  if (recipe.engine === "official-template") {
    if (!["video_fastvideo_fasth3_i2v", "api_ltx2_5_i2v"].includes(recipe.template) || !recipe.look)
      throw new Error("This trend's video recipe is incomplete.");
    for (const shot of recipe.shots) {
      const duration = shot.to - shot.from;
      if (!shot.prompt || !(recipe.template === "api_ltx2_5_i2v" ? [6, 8, 10].includes(duration) : duration >= 1 && duration <= 30)) throw new Error("This trend's timing or script is incomplete.");
    }
    return;
  }
  for (const shot of recipe.shots) {
    if (!files.controls?.[shot.pose ?? shot.guide]?.file)
      throw new Error("This trend's motion reference is missing. No generation was started.");
    if (!(shot.frames > 0) || !(shot.to > shot.from)) throw new Error("This trend's timing is incomplete.");
  }
}
