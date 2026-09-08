#!/usr/bin/env bash

set -eo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
dataset="${repo_root}/examples/harbor-office-tasks"
require_docker=false

usage() {
  cat <<'EOF'
Usage: ./scripts/validate-harbor.sh [options]

Options:
  --dataset PATH  Harbor dataset directory
  --docker        Also require Docker and build one representative task image
  -h, --help      Show this help
EOF
}

while (($#)); do
  case "$1" in
    --dataset)
      [[ $# -ge 2 ]] || { echo "Missing value for --dataset" >&2; exit 2; }
      dataset="$2"
      shift 2
      ;;
    --docker)
      require_docker=true
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

command -v python3 >/dev/null 2>&1 || {
  echo "python3 command was not found." >&2
  exit 1
}

arguments=("${script_dir}/validate_harbor.py" "$dataset")
if [[ "$require_docker" == true ]]; then
  arguments+=(--docker)
fi

export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
python3 "${arguments[@]}"
