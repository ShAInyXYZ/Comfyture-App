export const uploadRole = (trend, selected) => selected ?? trend?.cast?.[0]?.role ?? null;

// Resume only the same trend with the same people; a changed cast makes a new mix.
export function canResumeTrend(mix, id, roles) {
  return !!mix && mix.body?.kind === "trend" && mix.body.trend?.id === id && !mix.body.film
    && Object.keys(roles).every((role) => {
      const before = mix.body.trend.cast?.[role];
      const after = roles[role];
      return before && (after.crew ? before.crew === after.crew : before.star?.file === after.star?.file);
    });
}

export function validateRecipe(recipe, files) {
  if (!recipe?.shots?.length) throw new Error("This trend has no shots to generate.");
  for (const shot of recipe.shots) {
    if (!files.controls?.[shot.pose ?? shot.guide]?.file)
      throw new Error("This trend's motion reference is missing. No generation was started.");
    if (!(shot.frames > 0) || !(shot.to > shot.from)) throw new Error("This trend's timing is incomplete.");
  }
}
