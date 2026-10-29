/** Shared source/container bounds for browser encryption, IPFS and recovery. */
export const ASSET_LIMIT_LABEL='256 MiB';
export const MAX_ASSET_BYTES=256*1024*1024;
// ROADENC v1: 8-byte magic, 2-byte header length, up to 65535 header bytes,
// and a 16-byte AES-GCM authentication tag. A full-size original still fits.
export const MAX_ENCRYPTED_ASSET_BYTES=MAX_ASSET_BYTES+8+2+65535+16;
export const ENCRYPTED_ASSET_LIMIT_LABEL=ASSET_LIMIT_LABEL+' plus encryption overhead';
