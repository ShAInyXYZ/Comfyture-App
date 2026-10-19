// Mixer's trend shelf and its crew, written by scripts/mixer-trends.py from the crew's artwork and the
// trend research (docs/research/trends-2026-10-19). Each trend: its length, how hot it is now (1 to 5),
// who stars in it, its beats over time, and the feel of the music made for it (never the original track).
export const CREW = [
  {
    "id": "praline",
    "name": "Praline",
    "role": "Ringleader",
    "look": "the fluffy cream-and-caramel cat with amber eyes and a gold bell collar"
  },
  {
    "id": "sesame",
    "name": "Sesame",
    "role": "Reactor",
    "look": "the black cat with emerald-green eyes and a tiny cream chest tuft"
  },
  {
    "id": "mochi",
    "name": "Mochi",
    "role": "Scene-stealer",
    "look": "the round grey-lilac cat with pale blue eyes and a plum bow tie"
  },
  {
    "id": "meringue",
    "name": "Meringue",
    "role": "Performer",
    "look": "the snowy-white longhaired kitten with sky-blue eyes and a coral-pink ribbon"
  }
];

export const TRENDS = [
  {
    "id": "hotel-lobby",
    "name": "Hotel Lobby",
    "kind": "duo",
    "seconds": 18,
    "heat": 5,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "sesame"
      }
    ],
    "beats": [
      {
        "from": 0,
        "to": 2.6,
        "text": "Praline rubs both paws while Sesame raps into a paw"
      },
      {
        "from": 2.6,
        "to": 7.0,
        "text": "Praline raps at the mic; Sesame throws a paw at the camera"
      },
      {
        "from": 7.0,
        "to": 10.4,
        "text": "Praline raps to Sesame; Sesame answers with both paws"
      },
      {
        "from": 10.4,
        "to": 14.2,
        "text": "Sesame spins around while Praline keeps the verse going"
      },
      {
        "from": 14.2,
        "to": 18.0,
        "text": "Sesame salutes; Praline throws both paws up"
      }
    ],
    "music": {
      "bpm": 128,
      "genre": "half-time trap",
      "mood": "relaxed confidence",
      "instruments": [
        "808 bass",
        "dry snare",
        "closed hi-hats",
        "original sparse synth motif"
      ]
    },
    "caption": null,
    "aspect": "3:2",
    "preview": "brand/mixer/trends/hotel-lobby/preview.mp4",
    "poster": "brand/mixer/trends/hotel-lobby/poster.webp",
    "recipe": "brand/mixer/trends/hotel-lobby/recipe.json"
  },
  {
    "id": "smalltown-boy",
    "name": "Smalltown Boy",
    "kind": "reactions",
    "seconds": 20,
    "heat": 5,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "meringue"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 5.0,
        "text": "Praline fills foreground with paws beside cheeks; Meringue bounces behind"
      },
      {
        "from": 5.0,
        "to": 10.0,
        "text": "Meringue gasps near lens while Praline dances behind; maintain distinct silhouettes"
      },
      {
        "from": 10.0,
        "to": 20.0,
        "text": "Side-by-side original side steps until 16s; both take two broad steps toward lens, ending in comic nose close-up"
      }
    ],
    "music": {
      "bpm": 132,
      "genre": "1980s synth-pop",
      "mood": "euphoric melodrama",
      "instruments": [
        "arpeggiated synth",
        "electronic bass",
        "drum machine",
        "new wordless falsetto-like instrument"
      ]
    },
    "caption": "When the snack bag opens"
  },
  {
    "id": "state-property",
    "name": "State Property",
    "kind": "reactions",
    "seconds": 12,
    "heat": 5,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "mochi"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 1.0,
        "text": "Praline abruptly turns toward lens"
      },
      {
        "from": 1.0,
        "to": 3.0,
        "text": "Offscreen visitor asks about a picnic spot"
      },
      {
        "from": 3.0,
        "to": 8.0,
        "text": "Driver reacts, points at its lunchbox and delivers newly written territorial dialogue"
      },
      {
        "from": 8.0,
        "to": 12.0,
        "text": "Deadpan stare and window rises"
      }
    ],
    "music": {
      "bpm": 92,
      "genre": "Spoken comedy; optional sparse country-funk punctuation",
      "mood": "indignant then absurd",
      "instruments": [
        "new actor voice",
        "muted guitar",
        "woodblock"
      ]
    },
    "caption": null
  },
  {
    "id": "black-cat-clapping",
    "name": "Black Cat Clapping",
    "kind": "reactions",
    "seconds": 8,
    "heat": 5,
    "cast": [
      {
        "role": "Lead",
        "crew": "sesame"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 1.0,
        "text": "Sesame already wears an absurdly pleased grin"
      },
      {
        "from": 1.0,
        "to": 6.0,
        "text": "Three broad paw claps, with pauses"
      },
      {
        "from": 6.0,
        "to": 8.0,
        "text": "Slow approving nod"
      }
    ],
    "music": {
      "bpm": 96,
      "genre": "comic foley with optional sparse funk",
      "mood": "sarcastic delight",
      "instruments": [
        "new paw-clap foley",
        "soft bass",
        "woodblock"
      ]
    },
    "caption": null
  },
  {
    "id": "ramalama",
    "name": "Ramalama",
    "kind": "walks",
    "seconds": 10,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "meringue"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 1.0,
        "text": "Tiny oversized boots enter frame"
      },
      {
        "from": 1.0,
        "to": 5.0,
        "text": "Slow deliberate steps"
      },
      {
        "from": 5.0,
        "to": 7.0,
        "text": "Reveal Praline in an original pumpkin cape"
      },
      {
        "from": 7.0,
        "to": 10.0,
        "text": "Proud stare and ear twitch"
      }
    ],
    "music": {
      "bpm": 120,
      "genre": "theatrical electronic stomp",
      "mood": "playfully spooky",
      "instruments": [
        "stomps",
        "claps",
        "low toms",
        "original whispered textures",
        "new synth accents"
      ]
    },
    "caption": null
  },
  {
    "id": "la-calabaza",
    "name": "La Calabaza",
    "kind": "dance",
    "seconds": 14,
    "heat": 5,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "sesame"
      },
      {
        "role": "Third",
        "crew": "mochi"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 1.0,
        "text": "Trio snaps from head-down to paws-out"
      },
      {
        "from": 1.0,
        "to": 5.0,
        "text": "Two original side steps"
      },
      {
        "from": 5.0,
        "to": 9.0,
        "text": "Quarter-turn and tail wiggle"
      },
      {
        "from": 9.0,
        "to": 14.0,
        "text": "Face front and bounce forward"
      }
    ],
    "music": {
      "bpm": 132,
      "genre": "guaracha-inspired dance",
      "mood": "playful night parade",
      "instruments": [
        "four-on-floor kick",
        "Latin hand percussion",
        "bright synth stab",
        "new pumpkin-themed vocal chant"
      ]
    },
    "caption": null
  },
  {
    "id": "three-kittens",
    "name": "Three Kittens",
    "kind": "dance",
    "seconds": 12,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "sesame"
      },
      {
        "role": "Third",
        "crew": "meringue"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 1.0,
        "text": "All three strike an exaggerated stern pose"
      },
      {
        "from": 1.0,
        "to": 4.0,
        "text": "Original left-right paw pulses"
      },
      {
        "from": 4.0,
        "to": 8.0,
        "text": "Synchronized shoulder rocks"
      },
      {
        "from": 8.0,
        "to": 12.0,
        "text": "Two-step shuffle back to pose"
      }
    ],
    "music": {
      "bpm": 128,
      "genre": "punchy electronic dance",
      "mood": "mock-serious street crew",
      "instruments": [
        "kick",
        "clap",
        "rubbery synth bass",
        "short synth accents"
      ]
    },
    "caption": null
  },
  {
    "id": "bulin-47",
    "name": "Bulin 47",
    "kind": "dance",
    "seconds": 15,
    "heat": 5,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "sesame"
      },
      {
        "role": "Third",
        "crew": "meringue"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 1.0,
        "text": "Praline turns sharply toward a tiny speaker"
      },
      {
        "from": 1.0,
        "to": 7.0,
        "text": "Original shoulder bounce and two broad rap gestures"
      },
      {
        "from": 7.0,
        "to": 12.0,
        "text": "Backup animals cheer"
      },
      {
        "from": 12.0,
        "to": 15.0,
        "text": "Praline leans toward camera and freezes"
      }
    ],
    "music": {
      "bpm": 112,
      "genre": "Dominican dembow",
      "mood": "extroverted street-party swagger",
      "instruments": [
        "dembow kick/snare pattern",
        "sub bass",
        "percussion",
        "new original rhythmic chant"
      ]
    },
    "caption": null
  },
  {
    "id": "toc-toc",
    "name": "Toc Toc",
    "kind": "dance",
    "seconds": 12,
    "heat": 5,
    "cast": [
      {
        "role": "Lead",
        "crew": "meringue"
      },
      {
        "role": "Partner",
        "crew": "praline"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 1.0,
        "text": "Meringue hops once and knocks on an imaginary door"
      },
      {
        "from": 1.0,
        "to": 5.0,
        "text": "Repeat a simple hop/knock motif"
      },
      {
        "from": 5.0,
        "to": 9.0,
        "text": "Two side skips"
      },
      {
        "from": 9.0,
        "to": 12.0,
        "text": "Exaggerated listening pose and reset"
      }
    ],
    "music": {
      "bpm": 128,
      "genre": "French party-pop polka-like bounce",
      "mood": "cheerful and comic",
      "instruments": [
        "accordion-like original synth",
        "kick",
        "claps",
        "woodblock knock"
      ]
    },
    "caption": "Who ordered extra carrots?"
  },
  {
    "id": "tiptoe",
    "name": "Tiptoe",
    "kind": "walks",
    "seconds": 11,
    "heat": 5,
    "cast": [
      {
        "role": "Lead",
        "crew": "sesame"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 3.0,
        "text": "Sesame freezes with one paw near mouth"
      },
      {
        "from": 3.0,
        "to": 11.0,
        "text": "Sesame tiptoes across an original pantry, arms spread, tiny high-knee steps, then stops beside a cookie jar"
      }
    ],
    "music": {
      "bpm": 128,
      "genre": "comic swagger trap",
      "mood": "sneaky and theatrical",
      "instruments": [
        "808",
        "dry clap",
        "skittering hats",
        "original plucked synth"
      ]
    },
    "caption": "Me sneaking the last biscuit"
  },
  {
    "id": "alors-on-danse",
    "name": "Alors on Danse",
    "kind": "duo",
    "seconds": 14,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "mochi"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 1.0,
        "text": "Praline solemnly taps an oversized three-key toy while Mochi stares"
      },
      {
        "from": 1.0,
        "to": 4.0,
        "text": "Sparse notes"
      },
      {
        "from": 4.0,
        "to": 10.0,
        "text": "Beat arrives and Mochi bobs enthusiastically toward lens"
      },
      {
        "from": 10.0,
        "to": 14.0,
        "text": "Praline remains serious"
      }
    ],
    "music": {
      "bpm": 120,
      "genre": "minimal electro-house",
      "mood": "deadpan turning delighted",
      "instruments": [
        "four-on-floor kick",
        "synth bass",
        "new short reed-like synth motif",
        "clap"
      ]
    },
    "caption": "Producer / Executive producer"
  },
  {
    "id": "sway",
    "name": "Sway",
    "kind": "dance",
    "seconds": 12,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "mochi"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 12.0,
        "text": "Mochi already sways with oversized confidence"
      }
    ],
    "music": {
      "bpm": 112,
      "genre": "bouncy pop with South Asian-inspired percussion",
      "mood": "cheeky confidence",
      "instruments": [
        "rounded bass",
        "hand drums",
        "claps",
        "original bright keyboard motif"
      ]
    },
    "caption": null
  },
  {
    "id": "scuba",
    "name": "Scuba",
    "kind": "dance",
    "seconds": 10,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 10.0,
        "text": "Praline pinches its nose with one simplified paw"
      }
    ],
    "music": {
      "bpm": 152,
      "genre": "juke-inspired club bounce",
      "mood": "silly and buoyant",
      "instruments": [
        "short kick",
        "claps",
        "syncopated percussion",
        "new one-word vocal chops"
      ]
    },
    "caption": null
  },
  {
    "id": "lights-off",
    "name": "Lights Off",
    "kind": "dance",
    "seconds": 10,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "mochi"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 3.0,
        "text": "Mochi’s tired face and clear problem caption"
      },
      {
        "from": 3.0,
        "to": 10.0,
        "text": "Same head pose in an original violet party setting; gentle swaying, closed eyes and blissful smile"
      }
    ],
    "music": {
      "bpm": 128,
      "genre": "euphoric electro-house",
      "mood": "eyes-closed relief",
      "instruments": [
        "four-on-floor kick",
        "synth bass",
        "bright chords",
        "new vocal-free hook"
      ]
    },
    "caption": null
  },
  {
    "id": "closer",
    "name": "Closer",
    "kind": "duo",
    "seconds": 15,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "sesame"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 3.0,
        "text": "Praline lowers generic sunglasses and spots an approaching Sesame"
      },
      {
        "from": 3.0,
        "to": 9.0,
        "text": "Sesame enters with two quick hops"
      },
      {
        "from": 9.0,
        "to": 15.0,
        "text": "They turn side by side and perform a new simple bounce, then freeze"
      }
    ],
    "music": {
      "bpm": 124,
      "genre": "dance-pop house",
      "mood": "over-serious dance-off",
      "instruments": [
        "kick",
        "clap",
        "synth bass",
        "new clipped guitar pattern"
      ]
    },
    "caption": "We said one last dance"
  },
  {
    "id": "dance-with-me",
    "name": "Dance With Me",
    "kind": "duo",
    "seconds": 10,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "sesame"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 3.0,
        "text": "Original message asks Dance with me? Praline’s tiny loop appears and immediately sways"
      },
      {
        "from": 3.0,
        "to": 6.0,
        "text": "Sesame reply pops in, dancing a different simple loop"
      },
      {
        "from": 6.0,
        "to": 10.0,
        "text": "Both original loops enlarge together; finish on matching poses"
      }
    ],
    "music": {
      "bpm": 84,
      "genre": "slow electronic/phonk-style loop",
      "mood": "hypnotic playfulness",
      "instruments": [
        "sub bass",
        "soft distorted kick",
        "new bell motif",
        "original chopped syllables"
      ]
    },
    "caption": null
  },
  {
    "id": "dance-audition",
    "name": "Dance Audition",
    "kind": "dance",
    "seconds": 16,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "sesame"
      },
      {
        "role": "Third",
        "crew": "meringue"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 2.0,
        "text": "Praline and Sesame square up in front of an unimpressed Meringue"
      },
      {
        "from": 2.0,
        "to": 7.0,
        "text": "Praline shows an original wing-flick and two-step routine"
      },
      {
        "from": 7.0,
        "to": 12.0,
        "text": "Sesame responds with an original toe-tap and shoulder move"
      },
      {
        "from": 12.0,
        "to": 16.0,
        "text": "Meringue selects both; everyone shares a snack"
      }
    ],
    "music": {
      "bpm": 104,
      "genre": "mid-tempo R&B groove",
      "mood": "competitive charm",
      "instruments": [
        "rounded bass",
        "snare",
        "soft synth chords",
        "new syncopated melody"
      ]
    },
    "caption": "Auditions for snack captain"
  },
  {
    "id": "job-dance",
    "name": "Job Dance",
    "kind": "dance",
    "seconds": 12,
    "heat": 3,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      },
      {
        "role": "Partner",
        "crew": "mochi"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 2.0,
        "text": "Praline holds an empty food bowl with exaggerated hope"
      },
      {
        "from": 2.0,
        "to": 12.0,
        "text": "Praline and Mochi celebrate with original side steps while the caption reveals the mundane downside; finish with"
      }
    ],
    "music": {
      "bpm": 140,
      "genre": "indie-dance texture over trap rhythm",
      "mood": "cheerful movement with weary attitude",
      "instruments": [
        "jangly original guitar",
        "808",
        "hi-hats",
        "new vocal line"
      ]
    },
    "caption": "Finally got my dream job"
  },
  {
    "id": "sea-lion",
    "name": "Sea Lion",
    "kind": "dance",
    "seconds": 10,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "mochi"
      },
      {
        "role": "Partner",
        "crew": "praline"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 3.0,
        "text": "Mochi looks confidently at a cushion"
      },
      {
        "from": 3.0,
        "to": 10.0,
        "text": "Gentle cartoon belly-rock with paws at sides, then proud chin lift"
      }
    ],
    "music": {
      "bpm": 96,
      "genre": "novelty rap",
      "mood": "absurd aquatic bounce",
      "instruments": [
        "sparse drum machine",
        "bass",
        "new cartoon bark-like effects"
      ]
    },
    "caption": "New dance unlocked"
  },
  {
    "id": "face-dance",
    "name": "Face Dance",
    "kind": "reactions",
    "seconds": 8,
    "heat": 3,
    "cast": [
      {
        "role": "Lead",
        "crew": "meringue"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 8.0,
        "text": "Meringue raises one brow to an accent"
      }
    ],
    "music": {
      "bpm": 104,
      "genre": "short rhythmic pop beat",
      "mood": "playful expressiveness",
      "instruments": [
        "kick",
        "snare",
        "plucked bass",
        "new syllabic vocal or synth accents"
      ]
    },
    "caption": null
  },
  {
    "id": "grand-entrance",
    "name": "Grand Entrance",
    "kind": "glowups",
    "seconds": 10,
    "heat": 3,
    "cast": [
      {
        "role": "Lead",
        "crew": "meringue"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 1.0,
        "text": "Meringue enters with outsized confidence"
      },
      {
        "from": 1.0,
        "to": 7.0,
        "text": "Three original intro poses and a tiny shuffle"
      },
      {
        "from": 7.0,
        "to": 10.0,
        "text": "Awkward pause and proud nod"
      }
    ],
    "music": {
      "bpm": 100,
      "genre": "minimal bouncy hip-hop intro",
      "mood": "awkward confidence",
      "instruments": [
        "kick",
        "snare",
        "bass",
        "short original synth cue"
      ]
    },
    "caption": null
  },
  {
    "id": "documentary",
    "name": "Documentary",
    "kind": "reactions",
    "seconds": 12,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "praline"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 5.0,
        "text": "Empty interview chair beneath a dramatic caption"
      },
      {
        "from": 5.0,
        "to": 12.0,
        "text": "Praline looks toward an offscreen interviewer, pauses, then delivers a new line: It started with one crumb"
      }
    ],
    "music": {
      "bpm": 80,
      "genre": "documentary suspense underscore",
      "mood": "comically serious",
      "instruments": [
        "pulsing low strings",
        "soft ticking percussion",
        "sub hit",
        "new piano fragment"
      ]
    },
    "caption": "The day the treats disappeared"
  }
];

export const KINDS = [["all", "All"], ["dance", "Dance"], ["duo", "Duo"], ["reactions", "Reactions"], ["walks", "Walks"], ["glowups", "Glow-ups"]];
export const trendById = (id) => TRENDS.find((t) => t.id === id) ?? null;
export const crewById = (id) => CREW.find((c) => c.id === id) ?? null;
export const trendArt = (t) => `brand/mixer/trends/${t.id}.webp`;
export const crewFace = (id) => `brand/mixer/crew/${id}-face.webp`;
export const crewPicture = (id) => `brand/mixer/crew/${id}.png`;
