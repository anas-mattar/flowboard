#!/usr/bin/env bash
# Fails closed on a pull request whose head branch or title signals it should
# never reach main (STANDARDS §1.12, TAS-49 incident, TAS-60 decision, TAS-62).
set -euo pipefail

head_ref="${HEAD_REF:-}"
pr_title="${PR_TITLE:-}"

shopt -s nocasematch

if [[ "$head_ref" == scratch/* ]]; then
  echo "::error::head branch '$head_ref' matches scratch/** and must never be a pull request head (STANDARDS §1.12)"
  exit 1
fi

if [[ "$pr_title" == *"DO NOT MERGE"* ]]; then
  echo "::error::pull request title contains 'DO NOT MERGE': $pr_title"
  exit 1
fi

if [[ "$pr_title" == *"SCRATCH"* ]]; then
  echo "::error::pull request title contains 'SCRATCH': $pr_title"
  exit 1
fi

if [[ "$pr_title" =~ (^|[^[:alnum:]])WIP($|[^[:alnum:]]) ]]; then
  echo "::error::pull request title contains the word 'WIP': $pr_title"
  exit 1
fi

exit 0
