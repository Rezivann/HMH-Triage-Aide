# Deploying MedSAM to a Hugging Face Inference Endpoint (private)

Simpler than the Replicate/Cog route (see ../medsam-cog/ - that approach is superseded
by this one) - no Docker, no WSL2. HF builds and hosts the container for you; this
directory just holds the custom handler that tells it how to run box-prompted
segmentation, which isn't one of the standard pipeline tasks.

## 1. Push this handler to a model repo on the Hub

**Where this actually lives**: `huggingface-cli repo create` (or `hf repo create` -
see the CLI rename note below) creates a repo on **huggingface.co**, under your HF
account - `https://huggingface.co/<your-username>/wound-medsam`. That's a completely
separate, cloud-hosted git repo, unrelated to this LLMTriageApp repo, the same way a
GitHub repo under a different account would be. Nothing about this step touches
LLMTriageApp itself.

The `git clone` below, though, **does** create a local folder wherever you run it -
and that folder will contain a full copy of MedSAM's checkpoint (large binary
weights). **Run steps 2 onward from an unrelated scratch directory, not from inside
`ml-service/` or anywhere under LLMTriageApp** - cloning it here would nest a second,
large git repo inside this project's own git tree, which is exactly the kind of
mess `*.pth` being in `.gitignore` was meant to avoid one directory over
(`../medsam-cog/`). Once pushed to the Hub in step 2, this local clone can be
deleted entirely - only `handler.py`/`requirements.txt` in *this* directory are
meant to be kept, same as `medsam-cog/`'s files.

Use the `git@hf.co:...` SSH remote form, not `https://huggingface.co/...` - HF
deprecated password auth over HTTPS, and pointing the remote at the HTTPS URL means
`git push` tries to authenticate over HTTPS (token-based) even if your SSH key is
already set up and `ssh -T git@hf.co` succeeds - those are two independent checks,
succeeding at one says nothing about the other.

```bash
cd ~/somewhere-outside-LLMTriageApp        # NOT inside this repo
huggingface-cli repo create wound-medsam --private
git clone https://huggingface.co/flaviagiammarino/medsam-vit-base
cd medsam-vit-base
cp ../LLMTriageApp/ml-service/medsam-hf-endpoint/handler.py .
cp ../LLMTriageApp/ml-service/medsam-hf-endpoint/requirements.txt .
git remote set-url origin git@hf.co:Rezivan/wound-medsam
git add handler.py requirements.txt
git commit -m "Add custom box-prompted inference handler"
git push
```

(Making a private *copy* keeps the weights + your handler together under your own
repo, private, rather than depending on someone else's public repo staying up.)

If `git push` fails with an LFS error about a missing/incomplete `tf_model.h5`:
that's the TensorFlow weight variant, which `handler.py` never touches (it only
uses `transformers.SamModel`/`SamProcessor`, PyTorch). Since this is the first push
to a brand-new empty repo, drop it and start from one clean commit rather than
fighting to repair a partially-fetched LFS object:

```bash
git checkout --orphan clean-main
rm tf_model.h5
git add -A
git commit -m "Initial commit: MedSAM PyTorch weights + custom inference handler"
git branch -D main
git branch -m main
git push origin main --force
```

If that push is then rejected for containing binary files outside LFS (e.g.
`scripts/output.png`) - the original repo's `scripts/` folder is demo/example
content (usage scripts + sample images), not needed by `handler.py` at all. Drop
it and amend the same commit rather than adding another:

```bash
git rm -r --cached scripts
rm -rf scripts   # PowerShell: Remove-Item -Recurse -Force scripts (rm -rf is bash-only)
git commit --amend -m "Initial commit: MedSAM PyTorch weights + custom inference handler"
git push origin main --force
```

Note: `huggingface-cli` was renamed to `hf` in July 2025 (`hf repo create`, etc.) -
the old name still works as a deprecated alias, use whichever is actually installed.

## 2. Deploy it

1. Go to https://ui.endpoints.huggingface.co/ -> New Endpoint
2. Pick your repo (`<your-username>/wound-medsam`)
3. Choose an instance type with a GPU (segmentation is slow on CPU)
4. Two separate settings both involve the word "Custom" - don't conflate them:
   - **Task**: HF auto-detects `handler.py` and uses it regardless of what you
     pick here; it'll show as **Custom** in the dashboard once deployed. Nothing
     to actively choose.
   - **Inference Engine**: choose **Default** (the "Inference Toolkit"), NOT
     Custom. Default is what runs your `handler.py` automatically inside HF's
     own managed container. Inference Engine's "Custom" option means bringing
     your own prebuilt Docker image (Docker Hub/ECR/ACR) and will prompt for a
     container URL - not what you want here, since there's no separate image
     to provide.
5. Under Authentication, choose **Private** - not Public (no token at all) and not
   Authenticated (lets *any* Hugging Face user call it with their own token, not
   just you). Private restricts calls to you/your org's own token, which is what
   a proprietary backend service wants. This is separate from the repo's own
   Private visibility setting from step 1.
6. Create Endpoint - HF builds and hosts it, no local build step at all

## 3. Wire it into ml-service

In `ml-service/.env` (this endpoint serves both nail_segmentation.py and
wound_segmentation.py - see config.py's MEDSAM_ENDPOINT_URL comment):

```
MEDSAM_ENDPOINT_URL=<the endpoint URL HF gives you after deploying>
MEDSAM_API_KEY=<a Hugging Face access token with Inference Endpoints access>
```

## 4. Call shape (already implemented in app/services/nail_segmentation.py and wound_segmentation.py)

POST to `MEDSAM_ENDPOINT_URL` with header `Authorization: Bearer <token>` and
JSON body `{"inputs": {"image": "<base64 jpeg>", "box": [x1, y1, x2, y2]}}`. Response
matches `handler.py`'s return shape: `valid`, `failReasons`, `areaPx`, `boundingBox`,
`boundaryCoords`, `confidence`.

## 5. Tuning mask aggressiveness

`handler.py` reads `MASK_THRESHOLD` / `MASK_EROSION_PX` / `MASK_DILATION_PX` from
environment variables (defaults: `0.5` / `0` / `0` - see the comment above those
constants in `handler.py` for what each one does). Set these under your endpoint's
**Settings -> Environment Variables** in the HF dashboard, not `ml-service/.env` -
this code runs on the endpoint's own container, a separate deployment. Changing an
env var there restarts the endpoint without a full image rebuild, so it's fast to
iterate: tweak a value, wait for it to restart, re-run
`scripts/test_pipeline.py ... --show-image` to see the effect directly.

If you change `handler.py`'s actual code (not just these env var defaults), that
does need a redeploy - `cd` back into your local clone from step 1 (or re-clone),
copy the updated file over, commit, and `git push` again; the endpoint rebuilds
automatically once it detects the new commit.

## Where the `box` comes from

Front-end's `WoundBoxSelector.jsx` - a mandatory step in the kiosk flow (no skip,
unlike the nail box) where the patient draws a box around the wound itself. That's
passed through as `MeasurementRequest.woundBoxPrompt` and forwarded here by
`wound_segmentation.py` - not a placeholder, this is real end to end.
