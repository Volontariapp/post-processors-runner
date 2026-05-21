#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

# Dynamic detection of post-processor directories
get_workers() {
  find . -maxdepth 1 -type d -name "post-processor-*" | sed 's|./||' | sort
}

show_menu() {
  clear
  echo -e "${BOLD}${CYAN}"
  echo "╔══════════════════════════════════════════════╗"
  echo "║     Post-Processors Runner — Command Center  ║"
  echo "╚══════════════════════════════════════════════╝"
  echo -e "${NC}"

  echo -e "  ${BOLD}${CYAN}Maintenance${NC}"
  echo -e "  ${BOLD}1)${NC}  📦  Install All        ${DIM}— yarn install in all workers${NC}"
  echo -e "  ${BOLD}2)${NC}  🏗   Build All          ${DIM}— tsc in all workers${NC}"
  echo -e "  ${BOLD}3)${NC}  ✨  Lint All           ${DIM}— eslint --fix in all workers${NC}"
  echo -e "  ${BOLD}4)${NC}  🧪  Test All           ${DIM}— jest in all workers${NC}"
  echo -e "  ${BOLD}5)${NC}  🧹  Clean All          ${DIM}— Remove node_modules & dist${NC}"
  echo -e "  ${BOLD}6)${NC} 🔼  Bump Internal Deps ${DIM}— Update @volontariapp/* to latest${NC}"
  echo -e "  ${BOLD}7)${NC} ➕  Add/Update Pkg     ${DIM}— Add or update a package in all${NC}"

  echo -e "  ${BOLD}${CYAN}Development${NC}"
  echo -e "  ${BOLD}8)${NC}  🚀  Run All (Local)    ${DIM}— Launch all detected workers${NC}"
  echo -e "  ${BOLD}9)${NC}  🔄  Update ci-tools    ${DIM}— Update submodule to latest main${NC}"
  echo -e "  ${BOLD}10)${NC} 🔄  Safe Rebase        ${DIM}— Stash, rebase & pop changes${NC}"

  echo -e "\n  ${BOLD}0)${NC}  ❌  Exit"
  echo ""
}

run_on_all() {
  local cmd="$1"
  local label="$2"
  local WORKERS
  WORKERS=$(get_workers)

  echo -e "\n${BLUE}━━━ ${BOLD}${label}${NC}${BLUE} ━━━${NC}\n"

  for worker in $WORKERS; do
    echo -e "${CYAN}▸ Processing ${BOLD}${worker}${NC}..."
    (cd "$worker" && eval "$cmd")
  done

  echo -e "\n${GREEN}━━━ Done: ${label} ━━━${NC}\n"
}

while true; do
  show_menu
  read -rp "$(echo -e "${CYAN}▸${NC} Pick an option: ")" choice

  case "${choice}" in
    1) run_on_all "yarn install" "Installing Dependencies" ;;
    2) run_on_all "yarn build" "Building Projects" ;;
    3) run_on_all "yarn lint" "Linting Projects" ;;
    4) run_on_all "yarn test" "Running Tests" ;;
    5)
      echo -e "${YELLOW}⚠️  This will remove node_modules and dist in all projects.${NC}"
      read -rp "Are you sure? (y/N): " confirm
      if [[ $confirm == [yY] ]]; then
        run_on_all "rm -rf node_modules dist .yarn/cache yarn.lock" "Cleaning Projects"
      fi
      ;;
    6)
      echo -e "\n${BLUE}━━━ Bumping Internal Dependencies ━━━${NC}\n"
      if ! command -v jq &> /dev/null; then
          echo -e "${YELLOW}⚠  jq required. Please install it (brew install jq).${NC}"
          continue
      fi
      ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
      NPM_PKGS_DIR="${ROOT_DIR}/npm-packages"
      if [ ! -d "${NPM_PKGS_DIR}" ]; then
          echo -e "${RED}❌ Error: npm-packages directory not found at ${NPM_PKGS_DIR}${NC}"
          continue
      fi
      LATEST_VERSIONS=()
      PKG_JSONS=$(find "${NPM_PKGS_DIR}/packages" -name "package.json" -not -path "*/node_modules/*")
      for pj in ${PKG_JSONS}; do
          NAME=$(jq -r '.name' "${pj}")
          VERSION=$(jq -r '.version' "${pj}")
          LATEST_VERSIONS+=("${NAME}:${VERSION}")
      done
      WORKERS=$(get_workers)
      for worker in $WORKERS; do
          echo -e "${CYAN}▸ Checking ${BOLD}${worker}${NC}..."
          (
              cd "$worker"
              UPDATED=false
              for entry in "${LATEST_VERSIONS[@]}"; do
                  pkg_name="${entry%%:*}"
                  latest_v="${entry#*:}"
                  current_v=$(jq -r ".dependencies[\"$pkg_name\"] // empty" package.json || echo "")
                  if [ -z "$current_v" ]; then current_v=$(jq -r ".devDependencies[\"$pkg_name\"] // empty" package.json || echo ""); fi
                  if [ -n "$current_v" ] && [ "$current_v" != "$latest_v" ]; then
                      echo -e "  🔼 Updating ${pkg_name}: ${current_v} -> ${latest_v}"
                      jq ".dependencies[\"$pkg_name\"] = \"$latest_v\"" package.json > package.json.tmp && mv package.json.tmp package.json
                      jq ".devDependencies[\"$pkg_name\"] = \"$latest_v\"" package.json > package.json.tmp && mv package.json.tmp package.json
                      UPDATED=true
                  fi
              done
              [ "$UPDATED" = true ] && yarn install || echo -e "  ${DIM}Already up to date.${NC}"
          )
      done
      ;;
    7)
      echo -e "\n${BLUE}━━━ Add/Update Package ━━━${NC}\n"
      read -rp "Enter package name: " pkg_name
      [ -z "$pkg_name" ] && continue
      read -rp "Dev dependency? (y/N): " is_dev
      DEV_FLAG=""
      [[ $is_dev == [yY] ]] && DEV_FLAG="-D"
      run_on_all "yarn add $DEV_FLAG $pkg_name" "Adding $pkg_name"
      ;;
    8)
      echo -e "\n${BLUE}━━━ Running: All Workers ━━━${NC}\n"
      WORKERS=$(get_workers)
      CMD_PARTS=()
      NAMES=()
      for worker in $WORKERS; do
        NAMES+=("${worker#post-processor-}")
        CMD_PARTS+=("cd $worker && yarn start:local")
      done
      CONC_CMD="npx concurrently -k -p '[{name}]' -n $(IFS=,; echo "${NAMES[*]}") \"${CMD_PARTS[0]}\""
      for ((i=1; i<${#CMD_PARTS[@]}; i++)); do CONC_CMD+=" \"${CMD_PARTS[$i]}\""; done
      eval "$CONC_CMD"
      ;;
    9)
      echo -e "\n${BLUE}━━━ Updating ci-tools ━━━${NC}\n"
      git submodule update --remote ci-tools
      echo -e "${GREEN}Done.${NC}"
      ;;
    10)
      echo -e "\n${BLUE}━━━ Safe Rebase ━━━${NC}\n"
      git stash
      git pull --rebase origin main || git pull --rebase origin master
      git stash pop || echo -e "${YELLOW}No stash to pop.${NC}"
      ;;
    0)
      exit 0
      ;;
    *)
      echo -e "${RED}Invalid option.${NC}"
      ;;
  esac
  read -rp "$(echo -e "${DIM}Press Enter...${NC}")"
done
