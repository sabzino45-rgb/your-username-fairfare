// FairFare wrapper around the Tesseract.js worker.
// The English model is stored as lang/eng.traineddata.gz.wasm (a file type every host serves, including
// the claude.ai preview); this points the engine's request for eng.traineddata.gz at that file.
// The bytes are the unchanged gzip model from @tesseract.js-data/eng 1.0.0 (4.0.0_best_int).
const realFetch = self.fetch.bind(self);
self.fetch = (url, opts) => realFetch(String(url).replace(/eng\.traineddata\.gz$/, "eng.traineddata.gz.wasm"), opts);
importScripts("worker.min.js");
