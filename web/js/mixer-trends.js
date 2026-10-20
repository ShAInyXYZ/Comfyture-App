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
  },
  {
    "id": "earl",
    "name": "Earl",
    "role": "Mochi's owner",
    "look": "the grumpy old Texan rancher with a cream straw cowboy hat, bushy silver eyebrows, a silver handlebar mustache, a faded blue denim shirt and a plum bandana",
    "kind": "person",
    "pet": "mochi"
  },
  {
    "id": "josie",
    "name": "Josie",
    "role": "Praline's owner",
    "look": "the upbeat young creator with caramel-blonde curls in a messy bun, freckles, a butter-yellow cropped hoodie, light jeans and small gold hoop earrings",
    "kind": "person",
    "pet": "praline"
  },
  {
    "id": "theo",
    "name": "Theo",
    "role": "Sesame's owner",
    "look": "the laid-back young producer with short black twists, an oversized black tee, black joggers and emerald-green headphones around his neck",
    "kind": "person",
    "pet": "sesame"
  },
  {
    "id": "margot",
    "name": "Margot",
    "role": "Meringue's owner",
    "look": "the glamorous former stage actress with a sleek platinum-white bob, sky-blue eyes, a white blouse, cream trousers and a coral silk scarf",
    "kind": "person",
    "pet": "meringue"
  },
  {
    "id": "ivy",
    "name": "Ivy",
    "role": "Pickle's owner",
    "look": "the quirky plant-shop owner with a glossy black bob with blunt bangs, round tortoiseshell glasses, a leaf-green cardigan, a cream tee and brown corduroy trousers",
    "kind": "person",
    "pet": "pickle"
  },
  {
    "id": "dre",
    "name": "Dre",
    "role": "Bagel's owner, Theo's brother",
    "look": "Theo's big-hearted older brother with a short boxed beard, a burgundy bucket hat, a cream varsity jacket with burgundy sleeves and light jeans",
    "kind": "person",
    "pet": "bagel"
  }
];

export const TRENDS = [
  {
    "id": "state-property",
    "name": "State Property",
    "kind": "reactions",
    "soon": false,
    "home": "mixer",
    "also": [],
    "seconds": 17,
    "heat": 5,
    "cast": [
      {
        "role": "Lead",
        "crew": "earl"
      },
      {
        "role": "Partner",
        "crew": "mochi"
      }
    ],
    "beats": [
      {
        "from": 0.0,
        "to": 5.0,
        "text": "Earl turns to the camera, an arm on the sill, and starts complaining"
      },
      {
        "from": 5.0,
        "to": 7.8,
        "text": "Earl leans on the sill, grimacing"
      },
      {
        "from": 7.8,
        "to": 12.0,
        "text": "Earl sits back and points away down the lane"
      },
      {
        "from": 12.0,
        "to": 17.0,
        "text": "Earl points again, then holds up a card"
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
    "caption": null,
    "aspect": "9:16",
    "preview": "brand/mixer/trends/state-property/preview.mp4",
    "poster": "brand/mixer/trends/state-property/poster.webp",
    "recipe": "brand/mixer/trends/state-property/recipe.json",
    "made": {
      "seconds": 18.83,
      "firsts": 1
    }
  },
  {
    "id": "hotel-lobby",
    "name": "Hotel Lobby",
    "kind": "duo",
    "soon": false,
    "home": "jam",
    "also": [
      "mixer"
    ],
    "seconds": 18,
    "heat": 5,
    "cast": [
      {
        "role": "Lead",
        "crew": "dre"
      },
      {
        "role": "Partner",
        "crew": "theo"
      }
    ],
    "beats": [
      {
        "from": 0,
        "to": 2.6,
        "text": "Dre checks his wrist while Theo raps into a hand"
      },
      {
        "from": 2.6,
        "to": 7.0,
        "text": "Dre raps up at the mic; Theo points at the camera on the beat"
      },
      {
        "from": 7.0,
        "to": 10.4,
        "text": "Dre raps to Theo; Theo answers with open hands"
      },
      {
        "from": 10.4,
        "to": 14.2,
        "text": "Theo hides his face and spins around, back to the camera"
      },
      {
        "from": 14.2,
        "to": 18.0,
        "text": "A finger to the lips each, then Theo's salute"
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
    "aspect": "9:16",
    "preview": "brand/mixer/trends/hotel-lobby/preview.mp4",
    "poster": "brand/mixer/trends/hotel-lobby/poster.webp",
    "recipe": "brand/mixer/trends/hotel-lobby/recipe.json",
    "made": {
      "seconds": 19.58,
      "firsts": 6
    }
  },
  {
    "id": "smalltown-boy",
    "name": "Smalltown Boy",
    "kind": "reactions",
    "soon": false,
    "home": "mixer",
    "also": [],
    "seconds": 21,
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
        "from": 0,
        "to": 6.5,
        "text": "Praline sings up close, paws at the cheeks; Meringue dances behind"
      },
      {
        "from": 6.5,
        "to": 13.8,
        "text": "Meringue gasps up close, paws on the head; Praline dances behind"
      },
      {
        "from": 13.8,
        "to": 15.9,
        "text": "Side by side, paws up, they dance"
      },
      {
        "from": 15.9,
        "to": 17.7,
        "text": "From the floor: side steps, paws high"
      },
      {
        "from": 17.7,
        "to": 19.2,
        "text": "They stand tall and bounce"
      },
      {
        "from": 19.2,
        "to": 21.2,
        "text": "Both lunge at the lens, paws swiping"
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
    "caption": "When the snack bag opens",
    "aspect": "9:16",
    "preview": "brand/mixer/trends/smalltown-boy/preview.mp4",
    "poster": "brand/mixer/trends/smalltown-boy/poster.webp",
    "recipe": "brand/mixer/trends/smalltown-boy/recipe.json",
    "made": {
      "seconds": 24.25,
      "firsts": 6
    }
  },
  {
    "id": "black-cat-clapping",
    "name": "Black Cat Clapping",
    "kind": "reactions",
    "soon": false,
    "home": "none",
    "also": [],
    "seconds": 6,
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
        "to": 2.9,
        "text": "Sesame claps three times, right on the beat"
      },
      {
        "from": 2.9,
        "to": 5.0,
        "text": "Sesame shushes, paw to mouth"
      },
      {
        "from": 5.0,
        "to": 6.4,
        "text": "Sesame leans in at the lens"
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
    "caption": null,
    "aspect": "9:16",
    "preview": "brand/mixer/trends/black-cat-clapping/preview.mp4",
    "poster": "brand/mixer/trends/black-cat-clapping/poster.webp",
    "recipe": "brand/mixer/trends/black-cat-clapping/recipe.json",
    "made": {
      "seconds": 8.42,
      "firsts": 1
    }
  },
  {
    "id": "ramalama",
    "name": "Ramalama",
    "kind": "walks",
    "soon": false,
    "home": "none",
    "also": [],
    "seconds": 15,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "margot"
      },
      {
        "role": "Partner",
        "crew": "josie"
      },
      {
        "role": "Third",
        "crew": "ivy"
      }
    ],
    "beats": [
      {
        "from": 0,
        "to": 3.7,
        "text": "Velvet hems and buckled shoes stride at the lens"
      },
      {
        "from": 3.7,
        "to": 7.3,
        "text": "A broom swings past, the hems keep the beat"
      },
      {
        "from": 7.3,
        "to": 7.6,
        "text": "The camera whips up to their faces"
      },
      {
        "from": 7.6,
        "to": 11.3,
        "text": "Margot sweeps an arm and points, mouthing the lyric"
      },
      {
        "from": 11.3,
        "to": 15.0,
        "text": "A raised finger, three fingers up, then a wave from all three"
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
    "caption": null,
    "aspect": "9:16",
    "preview": "brand/mixer/trends/ramalama/preview.mp4",
    "poster": "brand/mixer/trends/ramalama/poster.webp",
    "recipe": "brand/mixer/trends/ramalama/recipe.json",
    "made": {
      "seconds": 16.21,
      "firsts": 2
    }
  },
  {
    "id": "la-calabaza",
    "name": "La Calabaza",
    "kind": "dance",
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
    "seconds": 10,
    "heat": 5,
    "cast": [
      {
        "role": "Lead",
        "crew": "josie"
      }
    ],
    "beats": [
      {
        "from": 0,
        "to": 2.4,
        "text": "Josie hops on one foot, knee up, flicking a foot"
      },
      {
        "from": 2.4,
        "to": 4.9,
        "text": "She knocks on an invisible door beside her head"
      },
      {
        "from": 4.9,
        "to": 7.6,
        "text": "Side-on hops and heel kicks, a quick turn"
      },
      {
        "from": 7.6,
        "to": 9.83,
        "text": "One more knock, then arms flung wide, a knee up"
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
    "caption": null,
    "aspect": "9:16",
    "preview": "brand/mixer/trends/toc-toc/preview.mp4",
    "poster": "brand/mixer/trends/toc-toc/poster.webp",
    "recipe": "brand/mixer/trends/toc-toc/recipe.json",
    "made": {
      "seconds": 10.75,
      "firsts": 1
    }
  },
  {
    "id": "tiptoe",
    "name": "Tiptoe",
    "kind": "walks",
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "jam",
    "also": [],
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
    "soon": false,
    "home": "mixer",
    "also": [],
    "seconds": 10,
    "heat": 3,
    "cast": [
      {
        "role": "Lead",
        "crew": "josie"
      }
    ],
    "beats": [
      {
        "from": 0,
        "to": 10.458,
        "text": "Her face keeps the beat: a brow, the cheeks, the eyes, the mouth, and a wide-eyed puff at the end"
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
    "caption": null,
    "aspect": "9:16",
    "preview": "brand/mixer/trends/face-dance/preview.mp4",
    "poster": "brand/mixer/trends/face-dance/poster.webp",
    "recipe": "brand/mixer/trends/face-dance/recipe.json",
    "made": {
      "seconds": 11.12,
      "firsts": 1
    }
  },
  {
    "id": "documentary",
    "name": "Documentary",
    "kind": "reactions",
    "soon": false,
    "home": "mixer",
    "also": [],
    "seconds": 8,
    "heat": 4,
    "cast": [
      {
        "role": "Lead",
        "crew": "margot"
      }
    ],
    "beats": [
      {
        "from": 0,
        "to": 2.0,
        "text": "Margot clips a microphone onto her collar"
      },
      {
        "from": 2.0,
        "to": 4.5,
        "text": "She folds her hands, grave, as if interviewed"
      },
      {
        "from": 4.5,
        "to": 7.83,
        "text": "A sly, knowing glance aside, then back to the camera"
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
    "caption": "documentary on how I survived my cat's first audition",
    "aspect": "9:16",
    "preview": "brand/mixer/trends/documentary/preview.mp4",
    "poster": "brand/mixer/trends/documentary/poster.webp",
    "recipe": "brand/mixer/trends/documentary/recipe.json",
    "made": {
      "seconds": 8.38,
      "firsts": 1
    }
  },
  {
    "id": "grand-entrance",
    "name": "Grand Entrance",
    "kind": "glowups",
    "soon": true,
    "home": "mixer",
    "also": [],
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
  }
];

export const KINDS = [["all", "All"], ["dance", "Dance"], ["duo", "Duo"], ["reactions", "Reactions"], ["walks", "Walks"], ["glowups", "Glow-ups"]];
export const trendById = (id) => TRENDS.find((t) => t.id === id) ?? null;
export const crewById = (id) => CREW.find((c) => c.id === id) ?? null;
export const trendArt = (t) => `brand/mixer/trends/${t.id}.webp`;
export const crewFace = (id) => `brand/mixer/crew/${id}-face.webp`;
export const crewPicture = (id) => `brand/mixer/crew/${id}.png`;
