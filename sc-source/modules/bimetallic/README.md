# Pd–Co/SiO₂ isolated learning module

Public route: https://162383.xyz/sc/lab/bimetallic/

`index.html` is a minimal wrapper; `guide.html` is the self-contained learning document. The preparation source and calculated values are in `preparation.json`. The source of the original guide is the user's 2026-10-26 HTML; the preparation was supplied on 2026-10-28 (actual experiment date unspecified).

The wrapper gives the iframe an opaque origin: `allow-same-origin` is deliberately absent. Only scripts, downloads, print dialogs and external-reference popups are permitted. No top navigation, forms, camera or microphone permissions are granted. Storage reads fail safely; exports remain available. Inline application code is constrained by its SHA-256 CSP hash, and `connect-src 'none'` disallows fetch/XHR. Content and personal notes are separate; no notes are committed. These are script/state boundaries, not authentication: the Pages files and repository are public.

Edit these files, then run `python3 sc-source/tools/sync_lab_module.py` to copy the module into `public/sc/lab/bimetallic/`. The archive builder also copies this directory on every full or frontend-only build. If inline guide JS changes, regenerate its CSP hash before publication.

Preserve the exact user addition order (Co solution before Pd solution). Do not turn nominal Pd:Co≈2:1 into a claim of measured composition or alloy formation. Future processing, reaction conditions and experimental results are unknown until separately supplied.
