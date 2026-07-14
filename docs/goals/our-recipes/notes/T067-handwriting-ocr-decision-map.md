# T067 — local handwriting OCR decision map

Date: 2026-07-13  
Scope: read-only research. No package/model installation, model download,
user-file processing, provider/credential access, configuration or code change,
or Docker run was performed.

## Decision: defer a handwriting-OCR Worker

There is a real, locally runnable handwriting recognizer candidate, but no
candidate currently proves the complete, maintainable **recipe-scan** pathway
required here. The strongest JavaScript route is TrOCR through Transformers.js,
not the existing Tesseract-based printed-text assist. It is trained for
handwriting, but its official model card limits raw use to **single text-line
images**. A normalized recipe page is a multi-line document. Introducing an
unproven page/line-segmentation stage would make an attractive demo rather than
a dependable, review-first recipe import feature.

The available converted ONNX repositories also do not supply a clear artifact
license in their metadata. One lightweight conversion is a third-party,
October-2024 repository with no declared license; the license-marked base-model
conversion repository is 11.7 GB in aggregate and likewise has no license tag.
Neither is a sufficient provenance basis for an immutable production model
bundle. Do not add a model runtime, model blobs, or a handwriting UI in this
state.

This is a technical defer, not a request for an OpenAI credential, a cloud OCR
exception, Docker access, or an operator decision. The original handwriting
criterion remains open.

## What is actually proven today

| Fact | Evidence | Consequence |
| --- | --- | --- |
| The present `tesseract.js` implementation is a locally bundled printed/legible English scan assist only. | T063, T064, T065 and [Tesseract.js's handwriting limitation](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md). | It cannot be treated as handwriting evidence. |
| Microsoft TrOCR small/base handwritten models are genuine handwriting models fine-tuned on IAM; the official repository reports IAM Cased CER of 4.22 for Small (62M parameters) and 3.42 for Base (334M). | [Microsoft TrOCR repository](https://github.com/microsoft/unilm/blob/master/trocr/README.md), [small model card](https://huggingface.co/microsoft/trocr-small-handwritten), and [base model card](https://huggingface.co/microsoft/trocr-base-handwritten). | This is handwriting-model evidence, not rendered-cursive or printed-text proxy evidence. |
| Both official model cards restrict raw OCR use to a **single text-line image**. | [Small card limitation](https://huggingface.co/microsoft/trocr-small-handwritten), [base card limitation](https://huggingface.co/microsoft/trocr-base-handwritten). | The current bounded multi-line recipe scan import cannot be sent whole-page to TrOCR and claimed reliable. A separately proven line-segmentation boundary is essential. |
| `@huggingface/transformers@4.2.0` is Apache-2.0 and includes `onnxruntime-node@1.24.3`; the package registry reports an about 9.5 MB unpacked library and about 220.3 MB unpacked native ONNX runtime. | Current registry metadata captured with `pnpm view` on this date; [Transformers.js Node documentation](https://huggingface.co/docs/transformers.js/en/tutorials/node). | This is a materially larger native runtime than the current local WASM OCR path. It must be installed and tested as a new native dependency before a compatibility claim can be made. |
| ONNX Runtime documents prebuilt CPU binaries for Windows x64/arm64 and Linux x64/arm64. | [ONNX Runtime Node binding platform table](https://onnxruntime.ai/docs/get-started/with-javascript/node.html). | Windows Node 24 development and Debian-slim/Unraid are plausible targets, but this is not a Node-24 or Docker execution result. |
| Transformers.js defaults to hosted model and WASM acquisition; its documented local mode requires a local model path, remote models disabled, and a local WASM path where the WASM backend is used. | [Transformers.js custom-model settings](https://huggingface.co/docs/transformers.js/custom_usage). | A future implementation must make all three paths explicit and test outbound-network denial; a normal first run must never download a model. |

## Candidate comparison

| Candidate | Handwriting and runtime evidence | Artifact, license, and resource evidence | Decision |
| --- | --- | --- | --- |
| Current `tesseract.js@7` + English data | Maintained local WASM runtime, but upstream explicitly warns that its settings do not materially improve handwriting. | Pinned small package model; already proven for printed text only. | **Reject for handwriting.** Keep unchanged as the printed-scan fallback. |
| `@huggingface/transformers@4.2.0` + `Xenova/trocr-small-handwritten` | The repository states it is ONNX weights for Microsoft's TrOCR small handwritten model and is compatible with Transformers.js. TrOCR small is trained on IAM handwriting. The model itself is single-line only. | Current hub metadata: revision `2432e24d184b1d964d07ed04f5d9e21d31a59141`, last modified 2024-10-08. A minimal apparent quantized encoder/merged-decoder pair is about 23.1 MB + 40.5 MB, before tokenizer/config assets; the required native runtime is about 220.3 MB unpacked. Its model card/API metadata declares no license, and its README calls the separate ONNX repository a temporary solution. | **Defer/reject as a production bundle.** It has promising technical fit but lacks line segmentation, production compatibility proof, and an artifact-license statement. |
| `@huggingface/transformers` + a self-vendored conversion of `microsoft/trocr-base-handwritten` | The official base card identifies an IAM fine-tune and declares MIT. The original checkpoint is about 1.33 GB. Transformers.js documents local, remote-disabled operation. | A current third-party ONNX conversion exposes a q4 merged decoder (~364.1 MB) plus q4 encoder (~57.8 MB), tokenizer/config assets, and native runtime; its repository is 11.7 GB total, revision `86de29d71e7229d7fd116c5213bebe5bd304ffd7`, last changed 2025-04-09, and no license tag. Self-conversion would need a separately pinned converter/toolchain and artifact hash/provenance process. It remains single-line. | **Defer.** The upstream model license is clearer, but the deployment asset and full-page pathway are not. |
| Direct Microsoft Python/PyTorch TrOCR path | The official project provides the model/evaluation path and its source repository is MIT. | It changes the application runtime/packaging surface from the selected Node/Next stack to Python/Torch and still needs line segmentation. | **Reject.** It does not meet the selected deployment architecture. |

The byte figures above are current hub package metadata observed without
downloading model assets. They are disk-floor figures, not a measured peak RAM,
latency, or container image result.

## Required future design, before any implementation approval

If a later Scout finds a license-clear full-page handwriting model or a
maintained, testable line-segmentation path, the Worker must first receive this
contract:

1. Vendor exact model files at a pinned immutable revision with per-file
   SHA-256, model-card/source URL, artifact license, converter version (if any),
   supported architecture, and total on-disk bytes in a source-controlled
   manifest. Copy those files to a read-only application directory in the
   Docker runner, outside `/data`; do not fetch, cache, or persist them in the
   household-data volume.
2. Set `env.localModelPath` to that verified local directory and
   `env.allowRemoteModels = false`; if the WASM backend is available, set its
   `wasmPaths` to a verified local package directory as documented. Block or
   test-fail every remote model, CDN, URL, proxy, and writable cache path. Use
   the native Node backend only after Windows and Linux container tests prove
   the exact pinned binary works.
3. Keep the existing byte-derived admission, normalized image artifacts,
   one-active/two-queued work control, total deadline, generic failure warning,
   local-only processing, source hash, editable review, and explicit
   confirmation. Never turn a recognizer result into a recipe automatically.
4. Treat full-page layout as a distinct input stage. The recognizer must receive
   verified single-line crops only; it may not silently resize a whole recipe
   page into one TrOCR input. The segmentation stage must carry ordered crop
   coordinates and source-artifact linkage, have its own bounded-resource tests,
   and be selected only after its own evidence task.
5. Persist immutable handwriting provenance in addition to the current import
   provenance: model/revision/file hashes, runtime/backend version, line-crop
   ordering, aggregate confidence if available, and a manual-review warning.
   Never log scan bytes, recognized text, or crop images.

## Handwriting-specific acceptance methodology

Do not use a cursive font, an IAM training/validation sample, or a cropped
model-card example as release evidence. Before this criterion can close, use a
repository-approved, consented fixture set of real handwritten English
recipe-like lines, with held-out acceptance samples. It should include
ingredients, fractions, quantities, units, temperatures, punctuation, method
phrases, common corrections, and six or more distinct writers across pen,
lighting, and scan/phone-capture conditions. Keep source images private if the
contributors' license/consent does not permit repository publication.

The future test plan must retain literal ground truth outside production data,
split development from held-out acceptance writers/lines, compute character
error rate and recipe-token error rate, and record hardware/architecture,
container image digest, model revision, offline-network status, latency, and
peak memory. A provisional release threshold is overall held-out CER at most
10%, no silent result where low confidence/manual review is required, and zero
outbound requests; the Judge must ratify or tighten that threshold only after a
measured baseline. This proves a review aid, not autonomous recipe accuracy.

## Exact next-task recommendation

Do **not** activate a handwriting implementation Worker from this Scout. First
run a Judge task that must choose between (a) a dedicated full-page
line-segmentation/model research package with license-clear artifacts, or (b)
deferring the handwriting criterion while completing the independent HEIC/HEIF
or archive boundary. The Judge must reject a line-crop-only feature as
completion of full recipe-scan handwriting support unless the product
requirement is explicitly narrowed.

### Stop conditions for any later handwriting Worker

- Missing explicit license/provenance for every shipped model artifact or
  converter output.
- Model loading performs, attempts, or can fall back to a network/CDN fetch.
- The exact native runtime fails under Node 24 Windows or the Debian-slim
  container, or the container cannot retain the model outside `/data`.
- Only whole-page input or synthetic/rendered-cursive fixtures are available;
  no independently validated line-segmentation and real-handwriting acceptance
  evidence exists.
- The change would widen into HEIC/HEIF, archives, PDF rendering, provider
  calls, or automatic recipe persistence.

## Sources

- [Microsoft TrOCR repository and IAM benchmark table](https://github.com/microsoft/unilm/blob/master/trocr/README.md)
- [Microsoft TrOCR small handwritten model card](https://huggingface.co/microsoft/trocr-small-handwritten)
- [Microsoft TrOCR base handwritten model card (MIT)](https://huggingface.co/microsoft/trocr-base-handwritten)
- [Xenova small handwritten ONNX model card](https://huggingface.co/Xenova/trocr-small-handwritten)
- [ONNX Community base handwritten conversion tree](https://huggingface.co/onnx-community/trocr-base-handwritten-ONNX/tree/main)
- [Transformers.js Node local-model documentation](https://huggingface.co/docs/transformers.js/en/tutorials/node)
- [Transformers.js custom-model/offline settings](https://huggingface.co/docs/transformers.js/custom_usage)
- [ONNX Runtime Node platform support](https://onnxruntime.ai/docs/get-started/with-javascript/node.html)
