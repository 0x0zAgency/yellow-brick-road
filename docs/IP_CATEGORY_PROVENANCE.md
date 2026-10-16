# IP categories and provenance

Yellow Bricks identify claimed rights in individual works. Buildings relate Bricks without transferring rights or automatically licensing anything.

The Mint Studio catalog contains 35 creator-selectable categories, including music, writing, images, film, choreography, motion capture, 3D works, games, software and research data. The taxonomy describes **what is being submitted**, not what legally qualifies for copyright, trademark, design rights, or ownership. The UI accepts all file extensions in its browser demo and records SHA-256 hashes of the exact original bytes.

## Choreography and spatial movement

Choreography, individual movement evidence, gestures, and motion-capture data have distinct categories. Their optional metadata includes creator-claimed recording/first-performance dates, capture rig, framerate, motion format, coordinate space, skeleton convention, performer and witness credits, and a URL for existing third-party attestations. These are creator **claims** unless independently verified.

* A hash can demonstrate that two records refer to the exact same bytes, not when the motion was invented.
* A block timestamp is evidence of registration, not proof of first creation or copyright ownership.
* A single dance move or ordinary step does not automatically create copyright protection. More extensive, fixed, original choreography may enjoy protection under applicable law.
* Recording performers can involve independent performer/consent rights.
* Spatial video and skeletal streams can disclose sensitive biometric/location characteristics. Keep originals encrypted and do not publish them or personal details as public metadata.
* Changing the encoding of a recording changes the byte hash. Record source/derivative relationships rather than treating hashes as equivalence proofs.

## Integrate existing provenance standards

Do not invent a competing provenance format. When available, reference authentic **C2PA** manifests for content authenticity and **W3C PROV-O** evidence graphs for people, activities, and source derivation. Current forms record links to external evidence, **not** cryptographic validation of those signatures or graphs. Future work should validate attestation signatures and timestamps and capture the validation result independently.

Real key delivery, access authorization, on-chain registration, and license settlement are separate future integrations from the current browser simulation. See `docs/GANACHE_LOCAL.md` and `docs/SEPOLIA_TESTNET.md`.
