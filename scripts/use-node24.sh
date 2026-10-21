#!/usr/bin/env bash
# Called by dev.cjs on macOS/Linux. Do not source an arbitrary shell profile.
# nvm does not support `set -e`; check every step explicitly instead.
if [ "$#" -eq 0 ]; then
  printf '%s\n' '[YBR] Missing Node entrypoint.' >&2
  exit 1
fi
nvm_script=''
for candidate in \
  "${NVM_DIR:+$NVM_DIR/nvm.sh}" \
  "$HOME/.nvm/nvm.sh" \
  "${XDG_CONFIG_HOME:-$HOME/.config}/nvm/nvm.sh" \
  '/opt/homebrew/opt/nvm/nvm.sh' \
  '/usr/local/opt/nvm/nvm.sh'; do
  if [ -n "$candidate" ] && [ -s "$candidate" ]; then
    nvm_script="$candidate"
    break
  fi
done
if [ -z "$nvm_script" ]; then
  printf '%s\n' '[YBR] Cannot find nvm. Install nvm or set NVM_DIR to its installation directory, then run nvm install 24.' >&2
  exit 1
fi
# A Homebrew nvm.sh lives outside the version-storage directory.
case "$nvm_script" in
  /opt/homebrew/opt/nvm/nvm.sh|/usr/local/opt/nvm/nvm.sh)
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" ;;
  *) export NVM_DIR="$(dirname "$nvm_script")" ;;
esac
if ! . "$nvm_script" --no-use; then
  printf '%s\n' '[YBR] Could not load nvm. Check NVM_DIR and your npm prefix configuration.' >&2
  exit 1
fi
if ! nvm use --silent 24; then
  printf '%s\n' '[YBR] Node 24 is not selected. Installing it with nvm...'
  if ! nvm install 24 || ! nvm use --silent 24; then
    printf '%s\n' '[YBR] Node 24 selection failed. Run nvm install 24 && nvm use 24, then retry. No YBR services were started.' >&2
    exit 1
  fi
fi
if [ "$(node -p "process.versions.node.split('.')[0]")" != '24' ]; then
  printf '%s\n' '[YBR] nvm did not select Node 24. Refusing to start under another runtime.' >&2
  exit 1
fi
# exec preserves terminal input and passes all arguments without shell evaluation.
exec node "$@"
