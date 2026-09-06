#!/usr/bin/env bash

set -eo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

agent=""
model=""
reasoning_effort=""
attempts=1
concurrent=1
job_name=""
dataset="${repo_root}/examples/harbor-office-tasks"
jobs_dir="${repo_root}/harbor-jobs"
agent_kwargs=()

usage() {
  cat <<'EOF'
Usage: ./scripts/run-office-cases.sh --agent NAME --model NAME [options]

Required:
  --agent NAME              Harbor agent name or module.path:ClassName
  --model NAME              Model name passed to the agent

Options:
  --reasoning-effort LEVEL  low, medium, high, xhigh, max, or ultra
  --agent-kwarg KEY=VALUE   Additional agent argument; may be repeated
  --attempts N              Attempts per task (default: 1)
  --concurrent N            Concurrent trials (default: 1)
  --job-name NAME           Harbor job name
  --dataset PATH            Dataset directory
  --jobs-dir PATH           Job output directory
  -h, --help                Show this help
EOF
}

require_value() {
  local option="$1"
  local count="$2"
  if ((count < 2)); then
    echo "Missing value for ${option}" >&2
    exit 2
  fi
}

while (($#)); do
  case "$1" in
    --agent)
      require_value "$1" "$#"
      agent="$2"
      shift 2
      ;;
    --model)
      require_value "$1" "$#"
      model="$2"
      shift 2
      ;;
    --reasoning-effort)
      require_value "$1" "$#"
      reasoning_effort="$2"
      shift 2
      ;;
    --agent-kwarg)
      require_value "$1" "$#"
      agent_kwargs+=("$2")
      shift 2
      ;;
    --attempts)
      require_value "$1" "$#"
      attempts="$2"
      shift 2
      ;;
    --concurrent)
      require_value "$1" "$#"
      concurrent="$2"
      shift 2
      ;;
    --job-name)
      require_value "$1" "$#"
      job_name="$2"
      shift 2
      ;;
    --dataset)
      require_value "$1" "$#"
      dataset="$2"
      shift 2
      ;;
    --jobs-dir)
      require_value "$1" "$#"
      jobs_dir="$2"
      shift 2
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

[[ -n "$agent" ]] || { echo "--agent is required." >&2; exit 2; }
[[ -n "$model" ]] || { echo "--model is required." >&2; exit 2; }

if [[ -n "$reasoning_effort" ]]; then
  case "$reasoning_effort" in
    low|medium|high|xhigh|max|ultra) ;;
    *) echo "Unsupported reasoning effort: ${reasoning_effort}" >&2; exit 2 ;;
  esac
fi

for value in "$attempts" "$concurrent"; do
  [[ "$value" =~ ^[0-9]+$ ]] && ((10#$value >= 1 && 10#$value <= 100)) || {
    echo "Attempts and concurrent must be integers between 1 and 100." >&2
    exit 2
  }
done

[[ -f "${dataset}/dataset.toml" ]] || {
  echo "Harbor dataset was not found: ${dataset}" >&2
  exit 1
}
command -v harbor >/dev/null 2>&1 || {
  echo "harbor command was not found. Install Harbor first." >&2
  exit 1
}
command -v docker >/dev/null 2>&1 || {
  echo "docker command was not found. Install and start Docker first." >&2
  exit 1
}
docker info >/dev/null 2>&1 || {
  echo "Docker is installed, but the Docker daemon is not running." >&2
  exit 1
}

export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
export PYTHONPATH="${repo_root}${PYTHONPATH:+:${PYTHONPATH}}"

harbor_args=(
  run
  --path "$dataset"
  --agent "$agent"
  --model "$model"
  --n-attempts "$attempts"
  --n-concurrent "$concurrent"
  --jobs-dir "$jobs_dir"
  --artifact /workspace/output
)

if [[ -n "$reasoning_effort" ]]; then
  harbor_args+=(--agent-kwarg "reasoning_effort=${reasoning_effort}")
fi
for value in "${agent_kwargs[@]}"; do
  harbor_args+=(--agent-kwarg "$value")
done
if [[ -n "$job_name" ]]; then
  harbor_args+=(--job-name "$job_name")
fi

printf 'Dataset : %s\n' "$dataset"
printf 'Agent   : %s\n' "$agent"
printf 'Model   : %s\n' "$model"
printf 'Jobs    : %s\n' "$jobs_dir"

exec harbor "${harbor_args[@]}"
