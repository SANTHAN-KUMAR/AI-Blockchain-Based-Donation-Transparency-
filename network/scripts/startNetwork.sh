#!/bin/bash

set -e

LOG_FILE="../startNetwork.log"

echo "========== START : Hyperledger Fabric Network Startup ==========" | tee -a $LOG_FILE

# Check for docker compose
if ! command -v docker &> /dev/null; then
    echo "[ERROR] docker not found. Please install Docker." | tee -a $LOG_FILE
    exit 1
fi

# Clean up any previous containers
echo "[INFO] Stopping any running Fabric containers..." | tee -a $LOG_FILE
docker compose -f ../docker-compose.yml down || echo "[WARN] No previous containers to stop." | tee -a $LOG_FILE

# Start Fabric containers
echo "[INFO] Starting Fabric network using docker-compose.yml..." | tee -a $LOG_FILE
docker compose -f ../docker-compose.yml up -d

if [ $? -eq 0 ]; then
    echo "[INFO] Fabric network started successfully." | tee -a $LOG_FILE
else
    echo "[ERROR] Failed to start Fabric network." | tee -a $LOG_FILE
    exit 2
fi

echo "========== END : Hyperledger Fabric Network Startup ==========" | tee -a $LOG_FILE