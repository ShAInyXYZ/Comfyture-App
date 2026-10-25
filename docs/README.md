# Docs

Where to find what, for anyone working on Comfyture or judging it.

## Start here

| | |
|---|---|
| [../README.md](../README.md) | What Comfyture is, the seven products, how to run it, the models, the settings |
| [competition/JUDGES.md](competition/JUDGES.md) | The one page a judge of #OpenSourceHiggsfield reads first |
| [guides/LOCAL-COMFYUI.md](guides/LOCAL-COMFYUI.md) | Rendering on your own GPU: ComfyUI, the comfy-api-proxy bridge, the account window's switch |
| [../examples/README.md](../examples/README.md) | The examples each product ships, the rules that put them in, and how to add one |

## The product

| | |
|---|---|
| [PRODUCT-MAP.md](PRODUCT-MAP.md) | Why seven products, whom each is for, how they share one engine |
| [AUDIT.md](AUDIT.md) | The 25 October audit: weight, errors, accessibility, tests, rights; what is left, ranked |
| [LTX-2.5-STUDY.md](LTX-2.5-STUDY.md) | How LTX-2.5 is driven: passes, guides, LoRAs |
| [VIDEO-TO-VIDEO.md](VIDEO-TO-VIDEO.md) | Copying a clip's motion onto a picture |
| [research/](research/) | The official workflows' shortlist, the trend research of 19 October |
| [../knowledge/utensils/](../knowledge/utensils/) | What Truffle knows of every tool and every official workflow |

## The challenge

| | |
|---|---|
| [competition/README.md](competition/README.md) | The plan: checklist against the rules, the blocker, the categories, the timeline to 30 October |
| [competition/HOSTING.md](competition/HOSTING.md) | How judges try it: a live copy in judge mode, the static demo, their own machine; costs |
| [competition/VIDEO.md](competition/VIDEO.md) · [storyboard.html](competition/storyboard.html) | The 1:55 demo video, beat by beat, with keyframes |

## Brand and design

| | |
|---|---|
| [brand/cast/](brand/cast/) | The pets' character sheets: Ketkout, Pickle, Paprika, Brioche, Crumpet, Truffle, Praline, Tofu, Bagel |
| [brand/mixer-crew/](brand/mixer-crew/) | Mixer's cats and the trend covers |
| [brand/products/](brand/products/) | Each product's design boards and mockups, version by version |

## In the code

Shared pieces live once and are used everywhere: the example seeder ([server/examples.ts](../server/examples.ts)), the tour engine
([web/js/tour.js](../web/js/tour.js), a tour per product in [web/js/tours/](../web/js/tours/)), the pets' harnesses and their chips
([web/js/harnesses.js](../web/js/harnesses.js)), where renders go ([server/target.ts](../server/target.ts)), judge mode
([server/judge.ts](../server/judge.ts)), and the DOM helpers ([web/js/dom.js](../web/js/dom.js)).
