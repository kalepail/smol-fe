#!/bin/bash
set -e

# Ensure nargo is in PATH
export PATH="$HOME/.nargo/bin:$PATH"
export PATH="$HOME/.bb:$PATH"

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo "Checking Noir toolchain..."

if ! command_exists noirup; then
    echo "noirup not found. Downloading installer..."
    curl -L -o /tmp/install_noirup.sh https://raw.githubusercontent.com/noir-lang/noirup/main/install
    
    if grep -q "404" /tmp/install_noirup.sh; then
        echo "Error: Failed to download noirup installer (404)."
        cat /tmp/install_noirup.sh
        exit 1
    fi
    
    bash /tmp/install_noirup.sh
else
    echo "noirup found."
fi

if ! command_exists nargo; then
    echo "nargo not found. Installing via noirup..."
    noirup
else
    echo "nargo found."
fi

nargo --version

if ! command_exists bb; then
    echo "bb not found. Downloading installer..."
    curl -L -o /tmp/install_bb.sh https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/scripts/install_bb.sh
    
    if grep -q "404" /tmp/install_bb.sh; then
        echo "Error: Failed to download bb installer (404)."
        cat /tmp/install_bb.sh
        exit 1
    fi

    bash /tmp/install_bb.sh
else
    echo "bb found."
fi

echo "Toolchain ready."
