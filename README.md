# BPM Checker

A client-side BPM estimator that can be hosted for free with GitHub Pages.

## Files
- `index.html` — page structure
- `style.css` — styling
- `script.js` — audio decoding and tempo analysis

## Publish with GitHub Pages
1. Create a new repository on GitHub.
2. Upload these three files to the repository's root (top-level) folder.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select your default branch (usually `main`) and the `/(root)` folder, then save.
6. Wait for GitHub Pages to publish; the site URL will appear in the Pages section.

No backend or build step is needed. Audio is processed locally in the visitor's browser and is not uploaded.

## Notes
This is an estimate, not a studio-grade beat tracker. The analyzer uses spectral-flux onset detection and onset-envelope autocorrelation. Half-time/double-time ambiguity and songs with changing tempo, weak percussion, or syncopation can affect the result. Browser codec support varies; WAV and MP3 are usually safe choices.
