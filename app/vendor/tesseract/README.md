# Vendored OCR engine

Tesseract.js 5.1.1 (Apache-2.0), tesseract.js-core 5.1.1 (LSTM builds, Apache-2.0) and the
English model from @tesseract.js-data/eng 1.0.0 (4.0.0_best_int), stored as lang/eng.traineddata.gz.wasm
so every host serves it; fairfare-worker.js points the engine at that name. Copied from npm so that
screenshot reading runs entirely from FairFare's own site: no third-party script or data host.
To update: npm pack those packages and copy the same files.
