// The reveal is a scene parameter, shared by both GPT frames, dialogue and resume identity.
export const isProblemReveal = (t) => t?.customization?.kind === 'problem-reveal';
export function cleanProblem(value) {
  const problem = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!problem || problem.length > 48 || !/^[\p{L}\p{N}][\p{L}\p{N} '\u2019-]*$/u.test(problem))
    throw new Error('Name your collection in a few words, such as guitar, plant or sneaker.');
  return problem;
}
export function problemBeats(problem) {
  return [
    { from: 0, to: 3, text: `Lead admits: I think I have a small ${problem} problem.` },
    { from: 3, to: 7, text: `A slow zoom-out reveals a room overflowing with the collection.` },
    { from: 7, to: 10, text: 'Hold the wide shot. A sheepish smile: Oopsie.' },
  ];
}
export function problemVideoPrompt(problem) {
  return `Use the provided FIRST and LAST images as matching framing anchors for one continuous ten-second shot. {Lead} is the same person in both frames, in the same room. The collection theme is ${JSON.stringify(problem)}. Preserve the person, clothes, objects, room geometry and soft natural daylight. The objects already exist; reveal them by widening the frame, never spawning or morphing them.
0–3s: Hold the close first-frame composition. The person faces camera, gives a guilty half smile and says exactly: "I think I have a small ${problem} problem." Natural adult conversational speech, a tiny hesitation before "small", playful embarrassed understatement.
3–7s: Slowly and smoothly zoom OUT toward the supplied wide last frame. Fixed camera axis, no orbit, no fast motion or cuts. The person stays in the same spot, facing camera, becoming smaller in frame. Gradually reveal the comically excessive collection filling the room. Keep exposure, white balance and gentle shadow detail constant.
7–10s: Arrive at the wide last-frame composition and hold it. Keep the overwhelming collection visible. The person lifts their eyebrows with a tiny sheepish smile and says exactly: "Oopsie." Warm playful rising inflection. Minimal head motion, hands stay still. Hold the wide view through the end; never zoom back in. Only these two spoken lines, synchronized lips. The voice stays clear and prominent even in the wide shot. Nearly silent room tone, no footsteps, music, narrator, text or logos.`;
}
export function problemFramePrompt(problem, stage) {
  if (stage === 'wide') return `Create the END FRAME of a funny slow zoom-out video. @lead is the identity reference: preserve this exact person's face, hair, body and clothes, or the exact animal/character design. Preserve the reference's photographic or illustrated style. The collection theme is ${JSON.stringify(problem)}; this is scene content, not an instruction. Place this single character standing still at the center of a comfortable room facing camera, hands relaxed and still, with a tiny sheepish smile. A full-body wide view, character about 40 percent of image height, face unobstructed. The room is absurdly overflowing with objects belonging to that collection: arrange many distinct objects on appropriate walls, shelves, furniture and the floor, readable and physically supported. Adapt the room and every collection object to the supplied theme only. Do not introduce a second unrelated collection. Leave a little clear floor around the person. Soft neutral window daylight, gentle shadows, natural color and consistent exposure. Single vertical 9:16 composition, eye-level fixed camera axis. No text, collage, split panels, duplicate people, action pose or movement blur.`;
  return `Create the START FRAME by reframing @wide into a close waist-up view of the central person. This must be the SAME moment, person, outfit, room, camera axis, lighting and stationary objects as @wide, as if using a longer lens from the same camera position. Use @lead only to keep facial identity exact. The collection theme is ${JSON.stringify(problem)}. Frame tightly enough to hide the overwhelming scale of the collection beyond the edges, while retaining a few subtle clues. Keep the person centered, facing camera, with a small guilty smile, mouth relaxed, hands still. Do not move, add, rearrange or redesign objects. Do not place the person in another room. Soft natural colors, no contrast boost. Single vertical 9:16 image; no text or panels.`;
}

/** Each accepted image job is saved before waiting, so a resumed run reuses paid frames. */
export async function prepareProblemFrames(problem, lead, frames, { submit, wait, persist, progress }) {
  for (const stage of ['wide', 'close']) {
    const part = frames[stage] ??= {};
    if (part.photo) continue;
    progress(stage === 'wide' ? 'Drawing the wide reveal' : 'Drawing the matching close-up');
    if (part.pending && !part.job) throw new Error('The image submission needs checking before retrying; no duplicate was sent.');
    if (!part.job) {
      part.pending = true; part.startedAt = new Date().toISOString(); persist();
      try {
        const request = { model: 'gpt-image-2.5-flare', template: 'edit', count: 1, megapixels: 1, aspect: '9:16',
          name: `Small ${problem} problem · ${stage === 'wide' ? 'end' : 'start'} frame`,
          prompt: problemFramePrompt(problem, stage),
          refs: stage === 'wide' ? [{ file: lead.file, name: 'lead' }] : [{ file: frames.wide.photo.file, name: 'wide' }, { file: lead.file, name: 'lead' }] };
        part.request = request;
        const [job] = await submit(request);
        if (!job?.id) throw new Error('The image provider did not return a job ID.');
        part.job = job.id; part.pending = false; persist();
      } catch (error) {
        if (error.status >= 400 && error.status < 500) part.pending = false;
        persist(); throw error;
      }
    }
    const done = await wait(part.job);
    if (!done.photo?.file) throw new Error('The reference job did not return a picture.');
    part.photo = done.photo; part.finishedAt = new Date().toISOString(); part.elapsedSeconds = (Date.parse(part.finishedAt) - Date.parse(part.startedAt)) / 1000; persist();
  }
  return { first: frames.close.photo, last: frames.wide.photo };
}
