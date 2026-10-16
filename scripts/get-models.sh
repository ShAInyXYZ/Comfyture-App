#!/usr/bin/env bash
# Downloads the models Comfyture's workflows load into a ComfyUI models folder.
#
#   scripts/get-models.sh /path/to/ComfyUI/models
#
# Needs the Hugging Face CLI (pip install -U "huggingface_hub[cli]") and a
# token that has accepted the terms of the Lightricks LTX-2.5 repositories
# (hf auth login). Files that are already there are skipped.
set -euo pipefail

MODELS="${1:?usage: scripts/get-models.sh /path/to/ComfyUI/models}"
command -v hf >/dev/null || { echo "Install the Hugging Face CLI: pip install -U \"huggingface_hub[cli]\""; exit 1; }

get() { # repo  path-in-repo  target-folder
  local repo="$1" file="$2" folder="$MODELS/$3" name
  name="$(basename "$file")"
  mkdir -p "$folder"
  if [ -f "$folder/$name" ]; then echo "have  $3/$name"; return; fi
  echo "get   $3/$name"
  # download next to the target, so putting the file in place is a rename on the same disk
  local tmp
  tmp="$(mktemp -d -p "$MODELS" .download.XXXXXX)"
  hf download "$repo" "$file" --local-dir "$tmp" >/dev/null
  mv "$tmp/$file" "$folder/$name"
  rm -rf "$tmp"
}

# LTX-2.5: video and sound
get Lightricks/LTX-2.5 diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors diffusion_models
get Lightricks/LTX-2.5 text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors text_encoders
get Lightricks/LTX-2.5 vae/ltx-2.5-video-vae-bf16.safetensors vae
get Lightricks/LTX-2.5 vae/ltx-2.5-audio-vae-bf16.safetensors vae
get Lightricks/LTX-2.5 latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors latent_upscale_models

# Qwen Image 2.1: painted end frames, generated and edited inputs
get Comfy-Org/Qwen-Image-2.1 diffusion_models/qwen_image_2.1_int8_convrot.safetensors diffusion_models
get Comfy-Org/Qwen-Image-2.1 text_encoders/qwen3vl_8b_int8_convrot.safetensors text_encoders
get Comfy-Org/Qwen-Image-2.1 vae/qwen_image_2.1_vae_bf16.safetensors vae

# The Director: Gemma 4 writes the shot lists
get Comfy-Org/gemma-4 text_encoders/gemma4_e4b_it_fp8_scaled.safetensors text_encoders

# Optional: the prompt enhancer, references (the LoRA, the dev model it needs, the cutout model),
# copying a video's motion (the union-control LoRA with the model and upscaler of Lightricks' example)
# and Production's detail LoRA and 48 fps upscaler
if [ "${ALL:-}" = 1 ]; then
  get Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors loras
  get Lightricks/LTX-2.5 diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors diffusion_models
  get Lightricks/LTX-2.3 ltx-2.3-spatial-upscaler-x2-1.1.safetensors latent_upscale_models
  get Comfy-Org/gemma-4 text_encoders/gemma4_e2b_it_int8_convrot.safetensors text_encoders
  get Lightricks/LTX-2.3-22b-IC-LoRA-Ingredients ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors loras
  get Lightricks/LTX-2.5 diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors diffusion_models
  get Comfy-Org/BiRefNet background_removal/birefnet.safetensors background_removal
  get Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors loras
  get Lightricks/LTX-2.5 latent_upscale_models/ltx-2.5-latent-temporal-upscaler-x2-bf16-1.0.safetensors latent_upscale_models
fi

echo "Done. Restart ComfyUI so it sees the new files."
