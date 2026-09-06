#!/usr/bin/env bash

set -eo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
root="${repo_root}/harbor-jobs"
port=8765
open_browser=true

usage() {
  cat <<'EOF'
Usage: ./scripts/start-trajectory-portal.sh [options]

Options:
  --root PATH  Harbor job root directory
  --port PORT  Local portal port (default: 8765)
  --no-open    Do not open the browser automatically
  -h, --help   Show this help
EOF
}

while (($#)); do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || { echo "Missing value for --root" >&2; exit 2; }
      root="$2"
      shift 2
      ;;
    --port)
      [[ $# -ge 2 ]] || { echo "Missing value for --port" >&2; exit 2; }
      port="$2"
      shift 2
      ;;
    --no-open)
      open_browser=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ "$port" =~ ^[0-9]+$ ]] && ((10#$port >= 1 && 10#$port <= 65535)) || {
  echo "Port must be an integer between 1 and 65535." >&2
  exit 2
}
[[ -d "$root" ]] || { echo "Harbor job directory was not found: $root" >&2; exit 1; }
[[ -f "${repo_root}/tools/trajectory-portal/dist/index.html" ]] || {
  echo "Trajectory Portal has not been built. Run npm install and npm run build in tools/trajectory-portal." >&2
  exit 1
}
command -v python3 >/dev/null 2>&1 || { echo "python3 command was not found." >&2; exit 1; }

arguments=("${repo_root}/tools/trajectory-portal/server.py" --root "$root" --port "$port")
if [[ "$open_browser" == false ]]; then
  arguments+=(--no-open)
fi

exec python3 "${arguments[@]}"
