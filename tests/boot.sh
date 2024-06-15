#!/usr/bin/env bash

export CODE_TESTS_PATH="$(pwd)/tests/.build/asserts"
export CODE_TESTS_WORKSPACE="$(pwd)/tests/.build/workspace"

node "$(pwd)/tests/.build/workspace/run.js"