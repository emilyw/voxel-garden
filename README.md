# Moss & Marrow — Voxel Garden

This is a static HTML/Three.js garden. Deploy the repository to Vercel (or serve it with any static file server); the root rewrite in `vercel.json` opens `voxel-garden.html` at `/`.

Garden records are stored independently in the browser’s `localStorage` under `moss-marrow-gardens-v1`. Existing `moss-marrow-3d-v2` saves are migrated once into a `My Garden` legacy record. Storage is device/browser-local: there is no backend, account, cloud sync, or cross-device merging. Clearing site data or switching browsers can remove access to saved gardens.

Run the model and storage tests with:

```sh
node --test tests/garden-model.test.mjs tests/garden-storage.test.mjs
```

The runtime loads Three.js 0.160.0 from jsDelivr, so a network connection is required for the 3D scene.
