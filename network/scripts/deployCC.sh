#!/bin/bash

set -e

# Ensure peer CLI finds core.yaml config
export FABRIC_CFG_PATH=$(realpath ../config)

LOG_FILE="../deployCC.log"
CHAINCODE_NAME="donationcontract"
CHAINCODE_VERSION="1.0"
CHAINCODE_PATH="../../chaincode" # <-- Corrected path!
CHANNEL_NAME="donationchannel"
CHAINCODE_LANG="node"

echo "========== START : Chaincode Deployment ==========" | tee -a $LOG_FILE
echo "[INFO] Using FABRIC_CFG_PATH: $FABRIC_CFG_PATH" | tee -a $LOG_FILE
echo "[INFO] Using chaincode path: ${CHAINCODE_PATH}" | tee -a $LOG_FILE

# Check if chaincode directory exists
if [ ! -d "$CHAINCODE_PATH" ]; then
  echo "[ERROR] Chaincode path '$CHAINCODE_PATH' does not exist. Aborting." | tee -a $LOG_FILE
  exit 2
fi

# Package chaincode
echo "[INFO] Packaging chaincode..." | tee -a $LOG_FILE
if ! peer lifecycle chaincode package ${CHAINCODE_NAME}.tar.gz --path ${CHAINCODE_PATH} --lang ${CHAINCODE_LANG} --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION} 2>>$LOG_FILE; then
  echo "[ERROR] Chaincode packaging failed. See $LOG_FILE for details." | tee -a $LOG_FILE
  tail -n 20 $LOG_FILE
  exit 3
fi

# Install chaincode
echo "[INFO] Installing chaincode on peer0.ngo.donation.com..." | tee -a $LOG_FILE
export CORE_PEER_LOCALMSPID="NGOMSP"
export CORE_PEER_ADDRESS="peer0.ngo.donation.com:7051"
export CORE_PEER_MSPCONFIGPATH="/etc/hyperledger/fabric/msp"

if ! peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz 2>>$LOG_FILE; then
  echo "[ERROR] Chaincode install failed. See $LOG_FILE for details." | tee -a $LOG_FILE
  tail -n 20 $LOG_FILE
  exit 4
fi

# Query installed chaincode package ID
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep "${CHAINCODE_NAME}_${CHAINCODE_VERSION}" | awk -F 'Package ID: |, Label:' '{print $2}')
echo "[INFO] Package ID: $PACKAGE_ID" | tee -a $LOG_FILE
if [ -z "$PACKAGE_ID" ]; then
  echo "[ERROR] Could not find package ID for ${CHAINCODE_NAME}_${CHAINCODE_VERSION}. Aborting." | tee -a $LOG_FILE
  tail -n 20 $LOG_FILE
  exit 5
fi

# Approve chaincode for NGO org
echo "[INFO] Approving chaincode definition for NGO..." | tee -a $LOG_FILE
if ! peer lifecycle chaincode approveformyorg \
    --channelID $CHANNEL_NAME \
    --name $CHAINCODE_NAME \
    --version $CHAINCODE_VERSION \
    --package-id $PACKAGE_ID \
    --sequence 1 \
    --init-required 2>>$LOG_FILE; then
  echo "[ERROR] Chaincode approveformyorg failed. See $LOG_FILE for details." | tee -a $LOG_FILE
  tail -n 20 $LOG_FILE
  exit 6
fi

# Commit chaincode definition
echo "[INFO] Committing chaincode definition to channel..." | tee -a $LOG_FILE
if ! peer lifecycle chaincode commit \
    --channelID $CHANNEL_NAME \
    --name $CHAINCODE_NAME \
    --version $CHAINCODE_VERSION \
    --sequence 1 \
    --init-required \
    --peerAddresses peer0.ngo.donation.com:7051 2>>$LOG_FILE; then
  echo "[ERROR] Chaincode commit failed. See $LOG_FILE for details." | tee -a $LOG_FILE
  tail -n 20 $LOG_FILE
  exit 7
fi

echo "[INFO] Chaincode deployed successfully." | tee -a $LOG_FILE
echo "========== END : Chaincode Deployment ==========" | tee -a $LOG_FILE